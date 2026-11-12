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
  /** Words without an equivalent (historical column palabras_dudosas). */
  doubtfulWords: string[];
  usedVocabulary: { espanol: string; damana: string }[];
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
          `SELECT creado_en, texto, traduccion, direccion, puntaje_medio,
                  fuente_top, ejemplos_recuperados, ejemplos_en_contexto,
                  palabras_dudosas
           FROM traducciones ORDER BY rowid`,
        )
        .all() as any[]
    ).map((f) => ({
      createdAt: f.creado_en,
      text: f.texto,
      translation: f.traduccion,
      direction: f.direccion,
      meanScore: f.puntaje_medio,
      topSource: f.fuente_top,
      retrievedExamples: f.ejemplos_recuperados,
      examplesInContext: f.ejemplos_en_contexto,
      doubtfulWords: JSON.parse(f.palabras_dudosas) as string[],
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
        `INSERT INTO traducciones
           (creado_en, texto, traduccion, direccion, puntaje_top, puntaje_medio,
            fuente_top, ejemplos_recuperados, ejemplos_en_contexto,
            palabras_dudosas, vocabulario_usado, modelo, confianza, reglas_aplicadas, glosa,
            tokens_entrada, tokens_salida, tokens_cache_leidos, tokens_cache_creados, duracion_ms)
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
          ? JSON.stringify(logEntry.gloss.map((g) => ({ origen: g.origin, destino: g.target })))
          : null,
        logEntry.usage?.inputTokens ?? null,
        logEntry.usage?.outputTokens ?? null,
        logEntry.usage?.cacheReadTokens ?? null,
        logEntry.usage?.cacheCreatedTokens ?? null,
        logEntry.durationMs ?? null,
      );
  }
}
