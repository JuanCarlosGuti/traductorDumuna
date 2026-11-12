import { Inject, Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { FuenteCorpus } from '../consulta/consulta.enums';
import { CONEXION_DB } from '../database/database.constants';
import { DireccionTraduccion, ParGlosaDto } from './dto/traduccion.dto';

/**
 * Usage reported by the provider for one call. With Anthropic all
 * four fields come from usage; compatible providers bring
 * prompt_tokens/completion_tokens and rarely the cache ones. null = not
 * reported.
 */
export interface UsoModelo {
  tokensEntrada: number | null;
  tokensSalida: number | null;
  /** Tokens served from the prompt cache (billed at 10%). */
  tokensCacheLeidos: number | null;
  /** Tokens written to the prompt cache (billed at 125%). */
  tokensCacheCreados: number | null;
}

export interface RegistroTraduccion {
  texto: string;
  traduccion: string;
  direccion: DireccionTraduccion;
  /** Similarity of the best retrieved example (0 if there was none). */
  puntajeTop: number;
  /** Mean of the similarities of the K examples: discriminates better than the top. */
  puntajeMedio: number;
  /** Which source the best match came from; null if there were no examples. */
  fuenteTop: FuenteCorpus | null;
  ejemplosRecuperados: number;
  /** How many examples came from sentences or phrases (the language in use). */
  ejemplosEnContexto: number;
  /** Words without an equivalent (historical column palabras_dudosas). */
  palabrasDudosas: string[];
  vocabularioUsado: { espanol: string; damana: string }[];
  modelo: string;
  confianza?: number;
  reglasAplicadas?: string[];
  glosa?: ParGlosaDto[];
  /** null if the provider did not report usage. */
  uso?: UsoModelo | null;
  /** How long the model call took (not counting retrieval). */
  duracionMs?: number | null;
}

/** Row as read from the table, for later analysis. */
export interface TraduccionRegistrada {
  creadoEn: string;
  texto: string;
  traduccion: string;
  direccion: DireccionTraduccion;
  puntajeMedio: number;
  fuenteTop: FuenteCorpus | null;
  ejemplosRecuperados: number;
  /** null in rows logged before v5 (it was not measured). */
  ejemplosEnContexto: number | null;
  palabrasDudosas: string[];
}

@Injectable()
export class TraduccionesRepository {
  constructor(@Inject(CONEXION_DB) private readonly db: Database) {}

  /** All logged translations, from oldest to most recent. */
  listar(): TraduccionRegistrada[] {
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
  registrar(registro: RegistroTraduccion, ahora: Date = new Date()): void {
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
        ahora.toISOString(),
        registro.texto,
        registro.traduccion,
        registro.direccion,
        registro.puntajeTop,
        registro.puntajeMedio,
        registro.fuenteTop,
        registro.ejemplosRecuperados,
        registro.ejemplosEnContexto,
        JSON.stringify(registro.palabrasDudosas),
        JSON.stringify(registro.vocabularioUsado),
        registro.modelo,
        registro.confianza ?? null,
        registro.reglasAplicadas ? JSON.stringify(registro.reglasAplicadas) : null,
        registro.glosa ? JSON.stringify(registro.glosa) : null,
        registro.uso?.tokensEntrada ?? null,
        registro.uso?.tokensSalida ?? null,
        registro.uso?.tokensCacheLeidos ?? null,
        registro.uso?.tokensCacheCreados ?? null,
        registro.duracionMs ?? null,
      );
  }
}
