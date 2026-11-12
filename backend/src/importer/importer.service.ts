import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { fixDamanaSpelling } from '../common/text/spelling';
import { tokenizeDamana } from '../common/text/tokenizer';
import { CorpusDomain } from '../query/query.enums';
import { inferTrigger } from '../query/rules';
import { DB_CONNECTION } from '../database/database.constants';
import { PendingRepository } from '../pending/pending.repository';
import {
  ElicitationRow,
  parseRow,
  ElicitationPlan,
  planElicitation,
} from './elicitation';
import { VocabularyCoverage } from './vocabulary-coverage';
import { headerKey, column, ReadSheet, readWorkbook } from './read-excel';
import { writeTests } from './tests-csv';

export const VOCABULARY_FILE = 'corpus_vocabulario_v3.csv';
export const RULES_FILE = 'reglas_damana.xlsx';
/** formato_elicitacion.xlsx, formato_elicitacion_lote1.xlsx, …_pendientes_2026-10-03.xlsx */
export const ELICITATION_PATTERN = /^formato_elicitacion.*\.xlsx$/i;

export interface ElicitationStats {
  archivos: number;
  filas: number;
  vocabulario: number;
  oraciones: number;
  pruebas: number;
  pendientes: number;
  resueltas: number;
  /** Unfilled rows whose word is already in the vocabulary: not requested. */
  cubiertasPorVocabulario: number;
  /** Pending items that were already open and the vocabulary covers: closed. */
  cerradasPorVocabulario: number;
  idsRepetidos: number;
}

export interface ImportStats {
  oraciones: number;
  frases: number;
  vocabulario: number;
  conjugaciones: number;
  reglas: number;
  nombresPropios: number;
  elicitacion: ElicitationStats;
  /** Rows left in pruebas_traduccion.csv after merging. */
  pruebasEnArchivo: number;
  totalTokens: number;
  topPalabras: { palabra: string; frecuencia: number }[];
}

interface SentenceRow {
  id: string;
  damana: string;
  espanol: string;
  estado: string;
  fuente: string;
}

interface PhraseRow {
  fuente: string;
  damana: string;
  espanol: string;
  notas: string;
}

interface VocabularyRow {
  espanol: string;
  damana: string;
  categoria: string;
  notas: string;
  fuente: string;
}

interface ConjugationRow {
  damana: string;
  espanol: string;
  lema: string;
  fuente: string;
  notas: string;
}

interface RuleRow {
  tipo: string;
  forma: string;
  significado: string;
  ejemploBase: string;
  ejemploRegla: string;
  traduccionEjemplo: string;
  notas: string;
  disparador: string | null;
}

interface ProperNameRow {
  damana: string;
  espanol: string;
  seEscribeIgual: boolean;
  otrasGrafias: string;
  notas: string;
}

/** The biblical booklet (lfb) is the only «biblical» corpus; the rest is everyday. */
export function sentenceDomain(source: string | undefined): CorpusDomain {
  return (source ?? '').trim().toLowerCase().startsWith('lfb')
    ? CorpusDomain.biblico
    : CorpusDomain.cotidiano;
}

@Injectable()
export class ImporterService {
  private readonly logger = new Logger(ImporterService.name);

  constructor(
    @Inject(DB_CONNECTION) private readonly db: Database,
    private readonly pendingItems: PendingRepository,
  ) {}

  /**
   * Imports the whole corpus idempotently: the 4 CSVs, the rules and
   * proper names from reglas_damana.xlsx and all the elicitation batches
   * (formato_elicitacion*.xlsx). Content tables are rebuilt
   * (DELETE + INSERT in one transaction); progreso_srs, traducciones,
   * validadas and pendientes are kept — in pendientes only the
   * unfilled elicitation rows are added and those that arrived
   * complete are closed —. One in every 10 complete elicitation rows is reserved
   * for pruebas_traduccion.csv and does not go into retrieval.
   */
  async importAll(dataDir: string): Promise<ImportStats> {
    const sentences = this.readCsv<SentenceRow>(dataDir, 'corpus_oraciones.csv');
    const phrases = this.readCsv<PhraseRow>(dataDir, 'corpus_frases_v2.csv');
    const vocabulary = this.readCsv<VocabularyRow>(dataDir, VOCABULARY_FILE);
    const conjugations = this.readCsv<ConjugationRow>(dataDir, 'corpus_conjugaciones.csv');
    const { reglas: rules, nombres: names } = await this.readRules(dataDir);
    const elicitation = await this.readElicitation(dataDir);
    const plan = planElicitation(elicitation.filas);
    const now = new Date().toISOString();
    // What the vocabulary already knows is not requested from the speakers (they
    // charge per word): an unfilled row whose word already exists is not
    // recorded as pending, and open pending items that the vocabulary
    // covers are closed.
    const coverage = new VocabularyCoverage([...vocabulary, ...plan.vocabulario]);
    const coveredByVocabulary = plan.pendientes.filter((p) => coverage.coversSpanish(p.palabra)).length;
    let closedByVocabulary = 0;

    const insertAll = this.db.transaction(() => {
      this.db.exec(
        'DELETE FROM tokens_damana; DELETE FROM oraciones; DELETE FROM frases; ' +
          'DELETE FROM vocabulario; DELETE FROM conjugaciones; ' +
          'DELETE FROM reglas; DELETE FROM nombres_propios;',
      );

      // Damana columns go through fixDamanaSpelling (ü→ʉ, see
      // common/text/spelling.ts); the source CSVs are left intact.
      const insSentence = this.db.prepare(
        `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente, dominio)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const row of sentences) {
        const damana = fixDamanaSpelling(row.damana);
        const info = insSentence.run(
          row.id,
          damana,
          row.espanol,
          row.estado,
          row.fuente,
          sentenceDomain(row.fuente),
        );
        this.tokenize(damana, 'oraciones', info.lastInsertRowid as number);
      }

      const insPhrase = this.db.prepare(
        'INSERT INTO frases (fuente, damana, espanol, notas, dominio) VALUES (?, ?, ?, ?, ?)',
      );
      for (const row of phrases) {
        const damana = fixDamanaSpelling(row.damana);
        const info = insPhrase.run(
          row.fuente,
          damana,
          row.espanol,
          row.notas,
          CorpusDomain.cotidiano,
        );
        this.tokenize(damana, 'frases', info.lastInsertRowid as number);
      }

      const insVocabulary = this.db.prepare(
        `INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const row of vocabulary) {
        const damana = fixDamanaSpelling(row.damana);
        const info = insVocabulary.run(
          row.espanol,
          damana,
          row.categoria,
          row.notas,
          row.fuente,
        );
        this.tokenize(damana, 'vocabulario', info.lastInsertRowid as number);
      }

      const insConjugation = this.db.prepare(
        `INSERT INTO conjugaciones (damana, espanol, lema, fuente, notas)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const row of conjugations) {
        const damana = fixDamanaSpelling(row.damana);
        const info = insConjugation.run(damana, row.espanol, row.lema, row.fuente, row.notas);
        this.tokenize(damana, 'conjugaciones', info.lastInsertRowid as number);
      }

      const insRule = this.db.prepare(
        `INSERT INTO reglas (tipo, forma, significado, ejemplo_base, ejemplo_regla,
                             traduccion_ejemplo, notas, disparador)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const r of rules) {
        insRule.run(
          r.tipo || null,
          r.forma,
          r.significado || null,
          r.ejemploBase || null,
          r.ejemploRegla || null,
          r.traduccionEjemplo || null,
          r.notas || null,
          r.disparador,
        );
      }

      const insName = this.db.prepare(
        `INSERT INTO nombres_propios (damana, espanol, se_escribe_igual, otras_grafias, notas)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const n of names) {
        insName.run(n.damana, n.espanol, n.seEscribeIgual ? 1 : 0, n.otrasGrafias || null, n.notas || null);
      }

      // Elicitation: vocabulary and everyday sentences (tests do NOT
      // go into the database: they live only in pruebas_traduccion.csv).
      for (const v of plan.vocabulario) {
        const info = insVocabulary.run(v.espanol, v.damana, v.categoria, v.notas || null, v.fuente);
        this.tokenize(v.damana, 'vocabulario', info.lastInsertRowid as number);
      }
      for (const o of plan.oraciones) {
        const info = insSentence.run(
          o.idExterno,
          o.damana,
          o.espanol,
          'aprobado',
          o.fuente,
          CorpusDomain.cotidiano,
        );
        this.tokenize(o.damana, 'oraciones', info.lastInsertRowid as number);
      }
      for (const p of plan.pendientes) {
        if (coverage.coversSpanish(p.palabra)) continue;
        this.pendingItems.recordFromElicitation(p.palabra, p.contexto, now);
      }
      for (const word of plan.resueltas) {
        this.pendingItems.markResolved(word, now);
      }
      for (const p of this.pendingItems.listOpen()) {
        if (coverage.covers(p.palabra, p.idioma) && this.pendingItems.markResolved(p.palabra, now)) {
          closedByVocabulary += 1;
        }
      }
    });
    insertAll();

    const testCases = writeTests(dataDir, plan.pruebas);
    return this.statistics(rules.length, names.length, elicitation, plan, testCases.total, {
      cubiertasPorVocabulario: coveredByVocabulary,
      cerradasPorVocabulario: closedByVocabulary,
    });
  }

  private readCsv<T>(dataDir: string, name: string): T[] {
    const content = fs.readFileSync(path.join(dataDir, name));
    return parse(content, {
      columns: true,
      bom: true,
      skip_empty_lines: true,
    }) as T[];
  }

  /**
   * reglas_damana.xlsx: «reglas» sheet and «nombres propios» sheet. It is optional
   * (a test corpus may not include it): if missing, a warning is shown and it carries on.
   */
  private async readRules(
    dataDir: string,
  ): Promise<{ reglas: RuleRow[]; nombres: ProperNameRow[] }> {
    const filePath = path.join(dataDir, RULES_FILE);
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`No se encontró ${RULES_FILE}: se importa sin reglas ni nombres propios.`);
      return { reglas: [], nombres: [] };
    }
    const sheets = await readWorkbook(filePath);
    const rulesSheet = sheets.find((h) => headerKey(h.nombre).includes('regla'));
    const namesSheet = sheets.find((h) => headerKey(h.nombre).includes('nombre'));

    const rules: RuleRow[] = (rulesSheet?.filas ?? [])
      .map((f) => {
        const kind = column(f, 'tipo');
        const meaning = column(f, 'significado', 'que hace');
        return {
          tipo: kind,
          forma: column(f, 'forma'),
          significado: meaning,
          ejemploBase: column(f, 'palabra base', 'base'),
          ejemploRegla: column(f, 'con la regla'),
          traduccionEjemplo: column(f, 'traduccion'),
          notas: column(f, 'notas'),
          disparador: inferTrigger(kind, meaning),
        };
      })
      .filter((r) => r.forma.length > 0);

    const names: ProperNameRow[] = (namesSheet?.filas ?? [])
      .map((f) => ({
        damana: fixDamanaSpelling(column(f, 'damana', 'como aparece')),
        espanol: column(f, 'espanol', 'nombre en'),
        seEscribeIgual: !/^no/i.test(column(f, 'igual').trim()),
        otrasGrafias: column(f, 'grafias'),
        notas: column(f, 'notas'),
      }))
      .filter((n) => n.damana.length > 0 && n.espanol.length > 0);

    return { reglas: rules, nombres: names };
  }

  /**
   * All the formato_elicitacion*.xlsx batches in the folder, in name
   * order. The sheet that has the palabra_es column is read (templates
   * also include an instructions sheet).
   */
  private async readElicitation(
    dataDir: string,
  ): Promise<{ archivos: string[]; filas: ElicitationRow[] }> {
    const files = fs
      .readdirSync(dataDir)
      .filter((n) => ELICITATION_PATTERN.test(n) && !n.startsWith('~$'))
      .sort((a, b) => a.localeCompare(b, 'es'));
    const rows: ElicitationRow[] = [];
    for (const file of files) {
      const sheets = await readWorkbook(path.join(dataDir, file));
      const sheet = sheets.find((h) => hasColumns(h, 'palabra_es'));
      if (!sheet) {
        this.logger.warn(`${file}: ninguna hoja tiene la columna palabra_es; se omite.`);
        continue;
      }
      for (const raw of sheet.filas) {
        const row = parseRow(raw, file);
        if (row) rows.push(row);
      }
    }
    return { archivos: files, filas: rows };
  }

  private tokenize(text: string, sourceTable: string, sourceId: number): void {
    const insToken = this.db.prepare(
      `INSERT INTO tokens_damana (palabra_normalizada, palabra_original, tabla_origen, id_origen, posicion)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const token of tokenizeDamana(text)) {
      insToken.run(token.normalizada, token.original, sourceTable, sourceId, token.posicion);
    }
  }

  private statistics(
    rules: number,
    properNames: number,
    elicitation: { archivos: string[]; filas: ElicitationRow[] },
    plan: ElicitationPlan,
    testsInFile: number,
    coverage: { cubiertasPorVocabulario: number; cerradasPorVocabulario: number },
  ): ImportStats {
    const count = (table: string): number =>
      (this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

    const topWords = this.db
      .prepare(
        `SELECT palabra_normalizada AS palabra, COUNT(*) AS frecuencia
         FROM tokens_damana
         GROUP BY palabra_normalizada
         ORDER BY frecuencia DESC, palabra_normalizada
         LIMIT 20`,
      )
      .all() as { palabra: string; frecuencia: number }[];

    return {
      oraciones: count('oraciones'),
      frases: count('frases'),
      vocabulario: count('vocabulario'),
      conjugaciones: count('conjugaciones'),
      reglas: rules,
      nombresPropios: properNames,
      elicitacion: {
        archivos: elicitation.archivos.length,
        filas: elicitation.filas.length,
        vocabulario: plan.vocabulario.length,
        oraciones: plan.oraciones.length,
        pruebas: plan.pruebas.length,
        pendientes: plan.pendientes.length - coverage.cubiertasPorVocabulario,
        resueltas: plan.resueltas.length,
        cubiertasPorVocabulario: coverage.cubiertasPorVocabulario,
        cerradasPorVocabulario: coverage.cerradasPorVocabulario,
        idsRepetidos: plan.idsRepetidos,
      },
      pruebasEnArchivo: testsInFile,
      totalTokens: count('tokens_damana'),
      topPalabras: topWords,
    };
  }
}

function hasColumns(sheet: ReadSheet, ...columns: string[]): boolean {
  const keys = new Set(sheet.encabezados.map(headerKey));
  return columns.every((c) => keys.has(c));
}
