import { Inject, Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { DB_CONNECTION } from '../database/database.constants';
import { CorpusDomain, CorpusSource } from './query.enums';
import {
  ConjugationDto,
  PhraseDto,
  LemmaDto,
  ProperNameDto,
  VocabularyDto,
} from './dto/query.dto';
import { Trigger, GrammarRule } from './rules';

export interface TextRow {
  id: number;
  reference: string;
  damanaText: string;
  spanishText: string;
  /** Sentences only: 'approved' | 'review' (alignment quality). */
  status?: string;
  /** Language register of the fragment (biblical, everyday, grammar). */
  domain: CorpusDomain;
}

export interface WordFrequency {
  word: string;
  frequency: number;
  originals: string[];
}

@Injectable()
export class CorpusRepository {
  constructor(@Inject(DB_CONNECTION) private readonly db: Database) {}

  listVocabulary(): VocabularyDto[] {
    return this.db
      .prepare(
        'SELECT rowid AS id, spanish AS spanish, damana, category AS category, notes AS notes, source AS source FROM vocabulary ORDER BY rowid',
      )
      .all() as VocabularyDto[];
  }

  listPhrases(): PhraseDto[] {
    return this.db
      .prepare(
        'SELECT rowid AS id, source AS source, damana, spanish AS spanish, notes AS notes, domain AS domain FROM phrases ORDER BY rowid',
      )
      .all() as PhraseDto[];
  }

  /** Grammar rules from reglas_damana.xlsx, with their trigger. */
  listRules(): GrammarRule[] {
    return (
      this.db
        .prepare(
          `SELECT rowid AS id, kind, form, meaning, base_example, rule_example,
                  example_translation, notes, trigger_feature
           FROM rules ORDER BY rowid`,
        )
        .all() as any[]
    ).map((f) => ({
      id: f.id,
      type: f.kind,
      form: f.form,
      meaning: f.meaning,
      baseExample: f.base_example,
      ruleExample: f.rule_example,
      exampleTranslation: f.example_translation,
      notes: f.notes,
      trigger: (f.trigger_feature as Trigger | null) ?? null,
    }));
  }

  listProperNames(): ProperNameDto[] {
    return (
      this.db
        .prepare(
          `SELECT rowid AS id, damana, spanish, same_spelling, other_spellings, notes
           FROM proper_names ORDER BY rowid`,
        )
        .all() as any[]
    ).map((f) => ({
      id: f.id,
      damana: f.damana,
      spanish: f.spanish,
      sameSpelling: f.same_spelling === 1,
      otherSpellings: f.other_spellings
        ? String(f.other_spellings)
            .split(/[,;]/)
            .map((g: string) => g.trim())
            .filter(Boolean)
        : [],
      notes: f.notes,
    }));
  }

  /** Verb lemmas with their number of conjugated forms. */
  listLemmas(): LemmaDto[] {
    return this.db
      .prepare(
        'SELECT lemma AS lemma, COUNT(*) AS forms FROM conjugations GROUP BY lemma ORDER BY lemma',
      )
      .all() as LemmaDto[];
  }

  /** Conjugations whose Damana form contains the word (via tokens). */
  conjugationsWithWord(normalizedWord: string): ConjugationDto[] {
    return this.db
      .prepare(
        `SELECT DISTINCT c.rowid AS id, c.damana, c.spanish AS spanish, c.lemma AS lemma, c.source AS source, c.notes AS notes
         FROM conjugations c
         JOIN damana_tokens t
           ON t.source_table = 'conjugations' AND t.source_id = c.rowid
         WHERE t.normalized_word = ?
         ORDER BY c.lemma, c.rowid`,
      )
      .all(normalizedWord) as ConjugationDto[];
  }

  /**
   * Conjugated forms grouped by lemma, to link together the
   * different persons of the same verb (nʉjkasheshisha / naijkasheshisha…).
   */
  formsByLemma(): { lemma: string; damana: string }[] {
    return this.db
      .prepare('SELECT lemma, damana FROM conjugations ORDER BY lemma, rowid')
      .all() as { lemma: string; damana: string }[];
  }

  listConjugations(): ConjugationDto[] {
    return this.db
      .prepare(
        'SELECT rowid AS id, damana, spanish AS spanish, lemma AS lemma, source AS source, notes AS notes FROM conjugations ORDER BY rowid',
      )
      .all() as ConjugationDto[];
  }

  conjugationsOf(lemma: string): ConjugationDto[] {
    return this.db
      .prepare(
        `SELECT rowid AS id, damana, spanish AS spanish, lemma AS lemma, source AS source, notes AS notes
         FROM conjugations WHERE lemma = ? ORDER BY rowid`,
      )
      .all(lemma) as ConjugationDto[];
  }

  /**
   * Rows from a source with their Damana and Spanish text already assembled for
   * concordance and retrieval. In sentences the reference marks those with
   * doubtful alignment with «(revisar)».
   */
  textsOf(source: CorpusSource): TextRow[] {
    switch (source) {
      case CorpusSource.sentences:
        return (
          this.db
            .prepare(
              'SELECT rowid AS id, damana, spanish, status, domain FROM sentences ORDER BY rowid',
            )
            .all() as any[]
        ).map((f) => ({
          id: f.id,
          reference: f.status === 'review' ? `oración ${f.id} (revisar)` : `oración ${f.id}`,
          damanaText: f.damana,
          spanishText: f.spanish ?? '',
          status: f.status,
          domain: f.domain as CorpusDomain,
        }));
      case CorpusSource.phrases:
        return (
          this.db
            .prepare(
              'SELECT rowid AS id, source, damana, spanish, domain FROM phrases ORDER BY rowid',
            )
            .all() as any[]
        ).map((f) => ({
          id: f.id,
          reference: f.source ? `frase ${f.id} (${f.source})` : `frase ${f.id}`,
          damanaText: f.damana,
          spanishText: f.spanish ?? '',
          domain: f.domain as CorpusDomain,
        }));
      case CorpusSource.vocabulary:
        return (
          this.db
            .prepare('SELECT rowid AS id, spanish, damana FROM vocabulary ORDER BY rowid')
            .all() as any[]
        ).map((f) => ({
          id: f.id,
          reference: `vocabulario ${f.id}`,
          damanaText: f.damana,
          spanishText: f.spanish,
          domain: CorpusDomain.everyday,
        }));
      case CorpusSource.conjugations:
        return (
          this.db
            .prepare('SELECT rowid AS id, damana, spanish, lemma FROM conjugations ORDER BY rowid')
            .all() as any[]
        ).map((f) => ({
          id: f.id,
          reference: `conjugación ${f.id} (${f.lemma})`,
          damanaText: f.damana,
          spanishText: f.spanish,
          domain: CorpusDomain.grammar,
        }));
    }
  }

  frequencyBySource(
    normalizedWord: string,
  ): { source: CorpusSource; frequency: number }[] {
    return this.db
      .prepare(
        `SELECT source_table AS source, COUNT(*) AS frequency
         FROM damana_tokens WHERE normalized_word = ?
         GROUP BY source_table ORDER BY source_table`,
      )
      .all(normalizedWord) as { source: CorpusSource; frequency: number }[];
  }

  originsOf(
    normalizedWord: string,
  ): { source: CorpusSource; id: number }[] {
    return this.db
      .prepare(
        `SELECT DISTINCT source_table AS source, source_id AS id
         FROM damana_tokens WHERE normalized_word = ?`,
      )
      .all(normalizedWord) as { source: CorpusSource; id: number }[];
  }

  spanishTextOf(source: CorpusSource, id: number): string {
    const column: Record<CorpusSource, string> = {
      [CorpusSource.sentences]: 'sentences',
      [CorpusSource.phrases]: 'phrases',
      [CorpusSource.vocabulary]: 'vocabulary',
      [CorpusSource.conjugations]: 'conjugations',
    };
    const row = this.db
      .prepare(`SELECT spanish FROM ${column[source]} WHERE rowid = ?`)
      .get(id) as { spanish: string | null } | undefined;
    return row?.spanish ?? '';
  }

  /**
   * All Damana words with their total frequency and the distinct
   * original forms in which they appear (for the proper-name
   * heuristic). The ',' separator is safe: the tokenizer never produces
   * commas inside a word.
   */
  frequenciesWithOriginals(): WordFrequency[] {
    return (
      this.db
        .prepare(
          `SELECT normalized_word AS word, COUNT(*) AS frequency,
                  GROUP_CONCAT(DISTINCT original_word) AS originals
           FROM damana_tokens
           GROUP BY normalized_word
           ORDER BY frequency DESC, word`,
        )
        .all() as any[]
    ).map((f) => ({
      word: f.word,
      frequency: f.frequency,
      originals: (f.originals as string).split(','),
    }));
  }
}
