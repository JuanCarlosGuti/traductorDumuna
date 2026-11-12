import { Inject, Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { CorpusSource } from '../consulta/consulta.enums';
import { DB_CONNECTION } from '../database/database.constants';
import { TranslationDirection, GlossPairDto } from './dto/traduccion.dto';

/**
 * Usage reported by the provider for one call. With Anthropic all
 * four fields come from usage; compatible providers bring
 * prompt_tokens/completion_tokens and rarely the cache ones. null = not
 * reported.
 */
export interface ModelUsage {
  tokensEntrada: number | null;
  tokensSalida: number | null;
  /** Tokens served from the prompt cache (billed at 10%). */
  tokensCacheLeidos: number | null;
  /** Tokens written to the prompt cache (billed at 125%). */
  tokensCacheCreados: number | null;
}

export interface TranslationLog {
  texto: string;
  traduccion: string;
  direccion: TranslationDirection;
  /** Similarity of the best retrieved example (0 if there was none). */
  puntajeTop: number;
  /** Mean of the similarities of the K examples: discriminates better than the top. */
  puntajeMedio: number;
  /** Which source the best match came from; null if there were no examples. */
  fuenteTop: CorpusSource | null;
  ejemplosRecuperados: number;
  /** How many examples came from sentences or phrases (the language in use). */
  ejemplosEnContexto: number;
  /** Words without an equivalent (historical column palabras_dudosas). */
  palabrasDudosas: string[];
  vocabularioUsado: { espanol: string; damana: string }[];
  modelo: string;
  confianza?: number;
  reglasAplicadas?: string[];
  glosa?: GlossPairDto[];
  /** null if the provider did not report usage. */
  uso?: ModelUsage | null;
  /** How long the model call took (not counting retrieval). */
  duracionMs?: number | null;
}

/** Row as read from the table, for later analysis. */
export interface LoggedTranslation {
  creadoEn: string;
  texto: string;
  traduccion: string;
  direccion: TranslationDirection;
  puntajeMedio: number;
  fuenteTop: CorpusSource | null;
  ejemplosRecuperados: number;
  /** null in rows logged before v5 (it was not measured). */
  ejemplosEnContexto: number | null;
  palabrasDudosas: string[];
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
      creadoEn: f.creado_en,
      texto: f.texto,
      traduccion: f.traduccion,
      direccion: f.direccion,
      puntajeMedio: f.puntaje_medio,
      fuenteTop: f.fuente_top,
      ejemplosRecuperados: f.ejemplos_recuperados,
      ejemplosEnContexto: f.ejemplos_en_contexto,
      palabrasDudosas: JSON.parse(f.palabras_dudosas) as string[],
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
        logEntry.texto,
        logEntry.traduccion,
        logEntry.direccion,
        logEntry.puntajeTop,
        logEntry.puntajeMedio,
        logEntry.fuenteTop,
        logEntry.ejemplosRecuperados,
        logEntry.ejemplosEnContexto,
        JSON.stringify(logEntry.palabrasDudosas),
        JSON.stringify(logEntry.vocabularioUsado),
        logEntry.modelo,
        logEntry.confianza ?? null,
        logEntry.reglasAplicadas ? JSON.stringify(logEntry.reglasAplicadas) : null,
        logEntry.glosa ? JSON.stringify(logEntry.glosa) : null,
        logEntry.uso?.tokensEntrada ?? null,
        logEntry.uso?.tokensSalida ?? null,
        logEntry.uso?.tokensCacheLeidos ?? null,
        logEntry.uso?.tokensCacheCreados ?? null,
        logEntry.duracionMs ?? null,
      );
  }
}
