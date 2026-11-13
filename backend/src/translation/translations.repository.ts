import { Inject, Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { CorpusSource } from '../query/query.enums';
import { DB_CONNECTION } from '../database/database.constants';
import { TranslationDirection, GlossPairDto } from './dto/translation.dto';

/**
 * Usage reported by the provider for one call. With Anthropic all
 * four fields come from usage; compatible providers bring
 * prompt_tokens/completion_tokens and rarely the cache ones. null = not
 * reported.
 */
export interface ModelUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  /** Tokens served from the prompt cache (billed at 10%). */
  cacheReadTokens: number | null;
  /** Tokens written to the prompt cache (billed at 125%). */
  cacheCreatedTokens: number | null;
}

export interface TranslationLog {
  text: string;
  translation: string;
  direction: TranslationDirection;
  /** Similarity of the best retrieved example (0 if there was none). */
  topScore: number;
  /** Mean of the similarities of the K examples: discriminates better than the top. */
  meanScore: number;
  /** Which source the best match came from; null if there were no examples. */
  topSource: CorpusSource | null;
  retrievedExamples: number;
  /** How many examples came from sentences or phrases (the language in use). */
  examplesInContext: number;
  /** Words without an equivalent (historical column doubtful_words). */
  doubtfulWords: string[];
  usedVocabulary: { spanish: string; damana: string }[];
  model: string;
  confidence?: number;
  appliedRules?: string[];
  gloss?: GlossPairDto[];
  /** null if the provider did not report usage. */
  usage?: ModelUsage | null;
  /** How long the model call took (not counting retrieval). */
  durationMs?: number | null;
}

/** Row as read from the table, for later analysis. */
export interface LoggedTranslation {
  createdAt: string;
  text: string;
  translation: string;
  direction: TranslationDirection;
  meanScore: number;
  topSource: CorpusSource | null;
  retrievedExamples: number;
  /** null in rows logged before v5 (it was not measured). */
  examplesInContext: number | null;
  doubtfulWords: string[];
}

@Injectable()
export class TranslationsRepository {
  constructor(@Inject(DB_CONNECTION) private readonly db: Database) {}

  /** All logged translations, from oldest to most recent. */
  listAll(): LoggedTranslation[] {
    return (
      this.db
        .prepare(
          `SELECT created_at, text, translation, direction, mean_score,
                  top_source, retrieved_examples, examples_in_context,
                  doubtful_words
           FROM translations ORDER BY rowid`,
        )
        .all() as any[]
    ).map((f) => ({
      createdAt: f.created_at,
      text: f.text,
      translation: f.translation,
      direction: f.direction,
      meanScore: f.mean_score,
      topSource: f.top_source,
      retrievedExamples: f.retrieved_examples,
      examplesInContext: f.examples_in_context,
      doubtfulWords: JSON.parse(f.doubtful_words) as string[],
    }));
  }

  /**
   * Stores a translation and its support signals. List fields are
   * serialized as JSON (SQLite has no array type and the volume is
   * minimal: one row per translation).
   */
  record(logEntry: TranslationLog, now: Date = new Date()): void {
    this.db
      .prepare(
        `INSERT INTO translations
           (created_at, text, translation, direction, top_score, mean_score,
            top_source, retrieved_examples, examples_in_context,
            doubtful_words, vocabulary_used, model, confidence, applied_rules, gloss,
            input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        now.toISOString(),
        logEntry.text,
        logEntry.translation,
        logEntry.direction,
        logEntry.topScore,
        logEntry.meanScore,
        logEntry.topSource,
        logEntry.retrievedExamples,
        logEntry.examplesInContext,
        JSON.stringify(logEntry.doubtfulWords),
        JSON.stringify(logEntry.usedVocabulary),
        logEntry.model,
        logEntry.confidence ?? null,
        logEntry.appliedRules ? JSON.stringify(logEntry.appliedRules) : null,
        // Stored JSON keeps the Spanish keys of the existing rows (data format).
        logEntry.gloss
          ? JSON.stringify(logEntry.gloss.map((g) => ({ origin: g.origin, target: g.target })))
          : null,
        logEntry.usage?.inputTokens ?? null,
        logEntry.usage?.outputTokens ?? null,
        logEntry.usage?.cacheReadTokens ?? null,
        logEntry.usage?.cacheCreatedTokens ?? null,
        logEntry.durationMs ?? null,
      );
  }
}
