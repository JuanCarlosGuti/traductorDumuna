import { Inject, Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { FuenteCorpus } from '../consulta/consulta.enums';
import { CONEXION_DB } from '../database/database.constants';
import { DireccionTraduccion, ParGlosaDto } from './dto/traduccion.dto';

/**
 * Consumo informado por el proveedor para una llamada. Con Anthropic los
 * cuatro campos vienen de usage; los proveedores compatibles traen
 * prompt_tokens/completion_tokens y rara vez los de caché. null = no lo
 * informó.
 */
export interface UsoModelo {
  tokensEntrada: number | null;
  tokensSalida: number | null;
  /** Tokens servidos desde la caché de prompts (cobrados al 10 %). */
  tokensCacheLeidos: number | null;
  /** Tokens escritos en la caché de prompts (cobrados al 125 %). */
  tokensCacheCreados: number | null;
}

export interface RegistroTraduccion {
  texto: string;
  traduccion: string;
  direccion: DireccionTraduccion;
  /** Similitud del mejor ejemplo recuperado (0 si no hubo ninguno). */
  puntajeTop: number;
  /** Media de las similitudes de los K ejemplos: discrimina mejor que el top. */
  puntajeMedio: number;
  /** De qué fuente vino el mejor match; null si no hubo ejemplos. */
  fuenteTop: FuenteCorpus | null;
  ejemplosRecuperados: number;
  /** Cuántos ejemplos venían de oraciones o frases (la lengua en uso). */
  ejemplosEnContexto: number;
  /** Palabras sin equivalente (columna histórica palabras_dudosas). */
  palabrasDudosas: string[];
  vocabularioUsado: { espanol: string; damana: string }[];
  modelo: string;
  confianza?: number;
  reglasAplicadas?: string[];
  glosa?: ParGlosaDto[];
  /** null si el proveedor no informó el consumo. */
  uso?: UsoModelo | null;
  /** Lo que tardó la llamada al modelo (sin contar el retrieval). */
  duracionMs?: number | null;
}

/** Fila tal como se lee de la tabla, para análisis posteriores. */
export interface TraduccionRegistrada {
  creadoEn: string;
  texto: string;
  traduccion: string;
  direccion: DireccionTraduccion;
  puntajeMedio: number;
  fuenteTop: FuenteCorpus | null;
  ejemplosRecuperados: number;
  /** null en las filas registradas antes de la v5 (no se medía). */
  ejemplosEnContexto: number | null;
  palabrasDudosas: string[];
}

@Injectable()
export class TraduccionesRepository {
  constructor(@Inject(CONEXION_DB) private readonly db: Database) {}

  /** Todas las traducciones registradas, de la más antigua a la más reciente. */
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
   * Guarda una traducción y sus señales de apoyo. Los campos de lista se
   * serializan como JSON (SQLite no tiene tipo array y el volumen es
   * mínimo: una fila por traducción).
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
