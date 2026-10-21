import { Inject, Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { CONEXION_DB } from '../database/database.constants';
import { DireccionTraduccion } from './dto/traduccion.dto';

export type OrigenValidacion = 'confirmada' | 'corregida';

export interface Validada {
  id: number;
  creadoEn: string;
  espanol: string;
  damana: string;
  direccion: DireccionTraduccion;
  origen: OrigenValidacion;
  traduccionModelo: string | null;
}

export interface NuevaValidada {
  espanol: string;
  damana: string;
  direccion: DireccionTraduccion;
  origen: OrigenValidacion;
  /** Lo que propuso el modelo (igual al par si fue confirmada). */
  traduccionModelo: string | null;
}

/**
 * Pares que el usuario dio por buenos («esta traducción es correcta») o
 * corrigió a mano. Es la futura fuente cotidiana de máxima confianza; por
 * ahora solo se acumula. Sobrevive a las reimportaciones.
 */
@Injectable()
export class ValidadasRepository {
  constructor(@Inject(CONEXION_DB) private readonly db: Database) {}

  guardar(nueva: NuevaValidada, ahora: Date = new Date()): void {
    this.db
      .prepare(
        `INSERT INTO validadas (creado_en, espanol, damana, direccion, origen, traduccion_modelo)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ahora.toISOString(),
        nueva.espanol,
        nueva.damana,
        nueva.direccion,
        nueva.origen,
        nueva.traduccionModelo,
      );
  }

  contar(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM validadas').get() as { n: number }).n;
  }

  listar(): Validada[] {
    return (
      this.db
        .prepare(
          `SELECT rowid AS id, creado_en, espanol, damana, direccion, origen, traduccion_modelo
           FROM validadas ORDER BY rowid`,
        )
        .all() as any[]
    ).map((f) => ({
      id: f.id,
      creadoEn: f.creado_en,
      espanol: f.espanol,
      damana: f.damana,
      direccion: f.direccion,
      origen: f.origen,
      traduccionModelo: f.traduccion_modelo,
    }));
  }
}
