import { Inject, Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { FuenteCorpus } from '../consulta/consulta.enums';
import { CONEXION_DB } from '../database/database.constants';
import {
  DireccionTraduccion,
  EntradaVocabularioUsadaDto,
} from './dto/traduccion.dto';

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
  palabrasDudosas: string[];
  vocabularioUsado: EntradaVocabularioUsadaDto[];
  modelo: string;
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
            palabras_dudosas, vocabulario_usado, modelo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      );
  }
}
