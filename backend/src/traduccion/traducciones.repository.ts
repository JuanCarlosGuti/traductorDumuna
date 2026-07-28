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
  palabrasDudosas: string[];
  vocabularioUsado: EntradaVocabularioUsadaDto[];
  modelo: string;
}

@Injectable()
export class TraduccionesRepository {
  constructor(@Inject(CONEXION_DB) private readonly db: Database) {}

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
            fuente_top, ejemplos_recuperados, palabras_dudosas, vocabulario_usado, modelo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        JSON.stringify(registro.palabrasDudosas),
        JSON.stringify(registro.vocabularioUsado),
        registro.modelo,
      );
  }
}
