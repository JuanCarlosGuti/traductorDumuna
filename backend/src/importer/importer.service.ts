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
  files: number;
  rows: number;
  vocabulary: number;
  sentences: number;
  tests: number;
  pending: number;
  resolved: number;
  /** Unfilled rows whose word is already in the vocabulary: not requested. */
  coveredByVocabulary: number;
  /** Pending items that were already open and the vocabulary covers: closed. */
  closedByVocabulary: number;
  repeatedIds: number;
}

export interface ImportStats {
  sentences: number;
  phrases: number;
  vocabulary: number;
  conjugations: number;
  rules: number;
  properNames: number;
  elicitation: ElicitationStats;
  /** Rows left in pruebas_traduccion.csv after merging. */
  testsInFile: number;
  totalTokens: number;
  topWords: { palabra: string; frecuencia: number }[];
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
  type: string;
  form: string;
  meaning: string;
  baseExample: string;
  ruleExample: string;
  exampleTranslation: string;
  notes: string;
  trigger: string | null;
}

interface ProperNameRow {
  damana: string;
  spanish: string;
  sameSpelling: boolean;
  otherSpellings: string;
  notes: string;
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
    const coverage = new VocabularyCoverage([
      ...vocabulary.map((v) => ({ spanish: v.espanol, damana: v.damana })),
      ...plan.vocabulary,
    ]);
    const coveredByVocabulary = plan.pending.filter((p) => coverage.coversSpanish(p.word)).length;
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
          r.type || null,
          r.form,
          r.meaning || null,
          r.baseExample || null,
          r.ruleExample || null,
          r.exampleTranslation || null,
          r.notes || null,
          r.trigger,
        );
      }

      const insName = this.db.prepare(
        `INSERT INTO nombres_propios (damana, espanol, se_escribe_igual, otras_grafias, notas)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const n of names) {
        insName.run(n.damana, n.spanish, n.sameSpelling ? 1 : 0, n.otherSpellings || null, n.notes || null);
      }

      // Elicitation: vocabulary and everyday sentences (tests do NOT
      // go into the database: they live only in pruebas_traduccion.csv).
      for (const v of plan.vocabulary) {
        const info = insVocabulary.run(v.spanish, v.damana, v.category, v.notes || null, v.source);
        this.tokenize(v.damana, 'vocabulario', info.lastInsertRowid as number);
      }
      for (const o of plan.sentences) {
        const info = insSentence.run(
          o.externalId,
          o.damana,
          o.spanish,
          'aprobado',
          o.source,
          CorpusDomain.cotidiano,
        );
        this.tokenize(o.damana, 'oraciones', info.lastInsertRowid as number);
      }
      for (const p of plan.pending) {
        if (coverage.coversSpanish(p.word)) continue;
        this.pendingItems.recordFromElicitation(p.word, p.context, now);
      }
      for (const word of plan.resolved) {
        this.pendingItems.markResolved(word, now);
      }
      for (const p of this.pendingItems.listOpen()) {
        if (coverage.covers(p.word, p.language) && this.pendingItems.markResolved(p.word, now)) {
          closedByVocabulary += 1;
        }
      }
    });
    insertAll();

    const testCases = writeTests(dataDir, plan.tests);
    return this.statistics(rules.length, names.length, elicitation, plan, testCases.total, {
      coveredByVocabulary: coveredByVocabulary,
      closedByVocabulary: closedByVocabulary,
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
    const rulesSheet = sheets.find((h) => headerKey(h.name).includes('regla'));
    const namesSheet = sheets.find((h) => headerKey(h.name).includes('nombre'));

    const rules: RuleRow[] = (rulesSheet?.rows ?? [])
      .map((f) => {
        const kind = column(f, 'tipo');
        const meaning = column(f, 'significado', 'que hace');
        return {
          type: kind,
          form: column(f, 'forma'),
          meaning: meaning,
          baseExample: column(f, 'palabra base', 'base'),
          ruleExample: column(f, 'con la regla'),
          exampleTranslation: column(f, 'traduccion'),
          notes: column(f, 'notas'),
          trigger: inferTrigger(kind, meaning),
        };
      })
      .filter((r) => r.form.length > 0);

    const names: ProperNameRow[] = (namesSheet?.rows ?? [])
      .map((f) => ({
        damana: fixDamanaSpelling(column(f, 'damana', 'como aparece')),
        spanish: column(f, 'espanol', 'nombre en'),
        sameSpelling: !/^no/i.test(column(f, 'igual').trim()),
        otherSpellings: column(f, 'grafias'),
        notes: column(f, 'notas'),
      }))
      .filter((n) => n.damana.length > 0 && n.spanish.length > 0);

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
      for (const raw of sheet.rows) {
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
      insToken.run(token.normalized, token.original, sourceTable, sourceId, token.position);
    }
  }

  private statistics(
    rules: number,
    properNames: number,
    elicitation: { archivos: string[]; filas: ElicitationRow[] },
    plan: ElicitationPlan,
    testsInFile: number,
    coverage: { coveredByVocabulary: number; closedByVocabulary: number },
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
      sentences: count('oraciones'),
      phrases: count('frases'),
      vocabulary: count('vocabulario'),
      conjugations: count('conjugaciones'),
      rules: rules,
      properNames: properNames,
      elicitation: {
        files: elicitation.archivos.length,
        rows: elicitation.filas.length,
        vocabulary: plan.vocabulary.length,
        sentences: plan.sentences.length,
        tests: plan.tests.length,
        pending: plan.pending.length - coverage.coveredByVocabulary,
        resolved: plan.resolved.length,
        coveredByVocabulary: coverage.coveredByVocabulary,
        closedByVocabulary: coverage.closedByVocabulary,
        repeatedIds: plan.repeatedIds,
      },
      testsInFile: testsInFile,
      totalTokens: count('tokens_damana'),
      topWords: topWords,
    };
  }
}

function hasColumns(sheet: ReadSheet, ...columns: string[]): boolean {
  const keys = new Set(sheet.headers.map(headerKey));
  return columns.every((c) => keys.has(c));
}
