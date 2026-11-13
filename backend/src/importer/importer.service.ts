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
  topWords: { word: string; frequency: number }[];
}

/**
 * The corpus CSVs are data files written in Spanish (they are shared with the
 * Wiwa community), so their headers and their status values stay in Spanish.
 * They are mapped to the English field names right when they are read.
 */
const CSV_COLUMNS: Record<string, string> = {
  id: 'id',
  damana: 'damana',
  espanol: 'spanish',
  estado: 'status',
  fuente: 'source',
  notas: 'notes',
  categoria: 'category',
  lema: 'lemma',
};

/** Sentence status values in corpus_oraciones.csv → status stored in the database. */
const CSV_SENTENCE_STATUS: Record<string, string> = {
  aprobado: 'approved',
  revisar: 'review',
};

interface SentenceRow {
  id: string;
  damana: string;
  spanish: string;
  status: string;
  source: string;
}

interface PhraseRow {
  source: string;
  damana: string;
  spanish: string;
  notes: string;
}

interface VocabularyRow {
  spanish: string;
  damana: string;
  category: string;
  notes: string;
  source: string;
}

interface ConjugationRow {
  damana: string;
  spanish: string;
  lemma: string;
  source: string;
  notes: string;
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
    ? CorpusDomain.biblical
    : CorpusDomain.everyday;
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
   * (DELETE + INSERT in one transaction); srs_progress, translations,
   * validated_pairs and pending_items are kept — in pending_items only the
   * unfilled elicitation rows are added and those that arrived
   * complete are closed —. One in every 10 complete elicitation rows is reserved
   * for pruebas_traduccion.csv and does not go into retrieval.
   */
  async importAll(dataDir: string): Promise<ImportStats> {
    const sentences = this.readCsv<SentenceRow>(dataDir, 'corpus_oraciones.csv');
    const phrases = this.readCsv<PhraseRow>(dataDir, 'corpus_frases_v2.csv');
    const vocabulary = this.readCsv<VocabularyRow>(dataDir, VOCABULARY_FILE);
    const conjugations = this.readCsv<ConjugationRow>(dataDir, 'corpus_conjugaciones.csv');
    const { rules: rules, names: names } = await this.readRules(dataDir);
    const elicitation = await this.readElicitation(dataDir);
    const plan = planElicitation(elicitation.rows);
    const now = new Date().toISOString();
    // What the vocabulary already knows is not requested from the speakers (they
    // charge per word): an unfilled row whose word already exists is not
    // recorded as pending, and open pending items that the vocabulary
    // covers are closed.
    const coverage = new VocabularyCoverage([
      ...vocabulary.map((v) => ({ spanish: v.spanish, damana: v.damana })),
      ...plan.vocabulary,
    ]);
    const coveredByVocabulary = plan.pending.filter((p) => coverage.coversSpanish(p.word)).length;
    let closedByVocabulary = 0;

    const insertAll = this.db.transaction(() => {
      this.db.exec(
        'DELETE FROM damana_tokens; DELETE FROM sentences; DELETE FROM phrases; ' +
          'DELETE FROM vocabulary; DELETE FROM conjugations; ' +
          'DELETE FROM rules; DELETE FROM proper_names;',
      );

      // Damana columns go through fixDamanaSpelling (ü→ʉ, see
      // common/text/spelling.ts); the source CSVs are left intact.
      const insSentence = this.db.prepare(
        `INSERT INTO sentences (external_id, damana, spanish, status, source, domain)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const row of sentences) {
        const damana = fixDamanaSpelling(row.damana);
        const info = insSentence.run(
          row.id,
          damana,
          row.spanish,
          CSV_SENTENCE_STATUS[row.status.trim().toLowerCase()] ?? row.status,
          row.source,
          sentenceDomain(row.source),
        );
        this.tokenize(damana, 'sentences', info.lastInsertRowid as number);
      }

      const insPhrase = this.db.prepare(
        'INSERT INTO phrases (source, damana, spanish, notes, domain) VALUES (?, ?, ?, ?, ?)',
      );
      for (const row of phrases) {
        const damana = fixDamanaSpelling(row.damana);
        const info = insPhrase.run(
          row.source,
          damana,
          row.spanish,
          row.notes,
          CorpusDomain.everyday,
        );
        this.tokenize(damana, 'phrases', info.lastInsertRowid as number);
      }

      const insVocabulary = this.db.prepare(
        `INSERT INTO vocabulary (spanish, damana, category, notes, source)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const row of vocabulary) {
        const damana = fixDamanaSpelling(row.damana);
        const info = insVocabulary.run(
          row.spanish,
          damana,
          row.category,
          row.notes,
          row.source,
        );
        this.tokenize(damana, 'vocabulary', info.lastInsertRowid as number);
      }

      const insConjugation = this.db.prepare(
        `INSERT INTO conjugations (damana, spanish, lemma, source, notes)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const row of conjugations) {
        const damana = fixDamanaSpelling(row.damana);
        const info = insConjugation.run(damana, row.spanish, row.lemma, row.source, row.notes);
        this.tokenize(damana, 'conjugations', info.lastInsertRowid as number);
      }

      const insRule = this.db.prepare(
        `INSERT INTO rules (kind, form, meaning, base_example, rule_example,
                             example_translation, notes, trigger_feature)
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
        `INSERT INTO proper_names (damana, spanish, same_spelling, other_spellings, notes)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const n of names) {
        insName.run(n.damana, n.spanish, n.sameSpelling ? 1 : 0, n.otherSpellings || null, n.notes || null);
      }

      // Elicitation: vocabulary and everyday sentences (tests do NOT
      // go into the database: they live only in pruebas_traduccion.csv).
      for (const v of plan.vocabulary) {
        const info = insVocabulary.run(v.spanish, v.damana, v.category, v.notes || null, v.source);
        this.tokenize(v.damana, 'vocabulary', info.lastInsertRowid as number);
      }
      for (const o of plan.sentences) {
        const info = insSentence.run(
          o.externalId,
          o.damana,
          o.spanish,
          'approved',
          o.source,
          CorpusDomain.everyday,
        );
        this.tokenize(o.damana, 'sentences', info.lastInsertRowid as number);
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
      columns: (headers: string[]) => headers.map((h) => CSV_COLUMNS[h.trim()] ?? h.trim()),
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
  ): Promise<{ rules: RuleRow[]; names: ProperNameRow[] }> {
    const filePath = path.join(dataDir, RULES_FILE);
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`${RULES_FILE} not found: importing without rules or proper names.`);
      return { rules: [], names: [] };
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

    return { rules: rules, names: names };
  }

  /**
   * All the formato_elicitacion*.xlsx batches in the folder, in name
   * order. The sheet that has the word_es column is read (templates
   * also include an instructions sheet).
   */
  private async readElicitation(
    dataDir: string,
  ): Promise<{ files: string[]; rows: ElicitationRow[] }> {
    const files = fs
      .readdirSync(dataDir)
      .filter((n) => ELICITATION_PATTERN.test(n) && !n.startsWith('~$'))
      .sort((a, b) => a.localeCompare(b, 'es'));
    const rows: ElicitationRow[] = [];
    for (const file of files) {
      const sheets = await readWorkbook(path.join(dataDir, file));
      const sheet = sheets.find((h) => hasColumns(h, 'palabra_es'));
      if (!sheet) {
        this.logger.warn(`${file}: no sheet has the palabra_es column; skipped.`);
        continue;
      }
      for (const raw of sheet.rows) {
        const row = parseRow(raw, file);
        if (row) rows.push(row);
      }
    }
    return { files: files, rows: rows };
  }

  private tokenize(text: string, sourceTable: string, sourceId: number): void {
    const insToken = this.db.prepare(
      `INSERT INTO damana_tokens (normalized_word, original_word, source_table, source_id, position)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const token of tokenizeDamana(text)) {
      insToken.run(token.normalized, token.original, sourceTable, sourceId, token.position);
    }
  }

  private statistics(
    rules: number,
    properNames: number,
    elicitation: { files: string[]; rows: ElicitationRow[] },
    plan: ElicitationPlan,
    testsInFile: number,
    coverage: { coveredByVocabulary: number; closedByVocabulary: number },
  ): ImportStats {
    const count = (table: string): number =>
      (this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

    const topWords = this.db
      .prepare(
        `SELECT normalized_word AS word, COUNT(*) AS frequency
         FROM damana_tokens
         GROUP BY normalized_word
         ORDER BY frequency DESC, normalized_word
         LIMIT 20`,
      )
      .all() as { word: string; frequency: number }[];

    return {
      sentences: count('sentences'),
      phrases: count('phrases'),
      vocabulary: count('vocabulary'),
      conjugations: count('conjugations'),
      rules: rules,
      properNames: properNames,
      elicitation: {
        files: elicitation.files.length,
        rows: elicitation.rows.length,
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
      totalTokens: count('damana_tokens'),
      topWords: topWords,
    };
  }
}

function hasColumns(sheet: ReadSheet, ...columns: string[]): boolean {
  const keys = new Set(sheet.headers.map(headerKey));
  return columns.every((c) => keys.has(c));
}
