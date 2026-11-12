import { Inject, Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { normalizar } from '../comun/texto/normalizador';
import { CONEXION_DB } from '../database/database.constants';

export type IdiomaPendiente = 'espanol' | 'damana';
export type EstadoPendiente = 'pendiente' | 'exportada' | 'resuelta';
export type OrigenPendiente = 'traductor' | 'elicitacion';

export interface Pendiente {
  id: number;
  palabra: string;
  idioma: IdiomaPendiente;
  contexto: string | null;
  vecesPedida: number;
  estado: EstadoPendiente;
  origen: OrigenPendiente;
  creadoEn: string;
  actualizadoEn: string;
}

/** Deduplication key: lowercase and no accents, with ʉ and ñ intact. */
export function clavePendiente(palabra: string): string {
  return normalizar(palabra.trim());
}

/**
 * Words the translator is missing. The table survives
 * re-imports: it is the bridge between what users ask for and what
 * the native speakers fill in on the elicitation format.
 */
@Injectable()
export class PendientesRepository {
  constructor(@Inject(CONEXION_DB) private readonly db: Database) {}

  /** All of them, most requested first (and among equals, the most recent). */
  listar(): Pendiente[] {
    return (
      this.db
        .prepare(
          `SELECT rowid AS id, palabra, idioma, contexto, veces_pedida, estado, origen,
                  creado_en, actualizado_en
           FROM pendientes
           ORDER BY veces_pedida DESC, actualizado_en DESC, rowid`,
        )
        .all() as any[]
    ).map(mapear);
  }

  /** Those that have not come back resolved yet: what is exported to the native speakers. */
  listarAbiertas(): Pendiente[] {
    return this.listar().filter((p) => p.estado !== 'resuelta');
  }

  /**
   * The translator found no equivalent for this word: it is recorded or,
   * if it was already there, one request is added. An already resolved word that is
   * requested again is reopened (a sign that the solution did not reach the corpus).
   */
  registrarPedida(
    palabra: string,
    idioma: IdiomaPendiente,
    contexto: string | null,
    ahora: string = new Date().toISOString(),
  ): void {
    const limpia = palabra.trim();
    if (!limpia) return;
    this.db
      .prepare(
        `INSERT INTO pendientes
           (clave, palabra, idioma, contexto, veces_pedida, estado, origen, creado_en, actualizado_en)
         VALUES (?, ?, ?, ?, 1, 'pendiente', 'traductor', ?, ?)
         ON CONFLICT(clave) DO UPDATE SET
           veces_pedida = veces_pedida + 1,
           contexto = COALESCE(pendientes.contexto, excluded.contexto),
           estado = CASE WHEN pendientes.estado = 'resuelta' THEN 'pendiente' ELSE pendientes.estado END,
           actualizado_en = excluded.actualizado_en`,
      )
      .run(clavePendiente(limpia), limpia, idioma, contexto, ahora, ahora);
  }

  /**
   * Elicitation row that came back unfilled. It does not add requests or overwrite
   * what was already there: it only guarantees the word is listed as pending.
   */
  registrarDeElicitacion(
    palabra: string,
    contexto: string | null,
    ahora: string = new Date().toISOString(),
  ): boolean {
    const limpia = palabra.trim();
    if (!limpia) return false;
    const info = this.db
      .prepare(
        `INSERT INTO pendientes
           (clave, palabra, idioma, contexto, veces_pedida, estado, origen, creado_en, actualizado_en)
         VALUES (?, ?, 'espanol', ?, 1, 'pendiente', 'elicitacion', ?, ?)
         ON CONFLICT(clave) DO NOTHING`,
      )
      .run(clavePendiente(limpia), limpia, contexto || null, ahora, ahora);
    return info.changes > 0;
  }

  /** The word arrived translated: it is closed if it was open. */
  marcarResuelta(palabra: string, ahora: string = new Date().toISOString()): boolean {
    const info = this.db
      .prepare(
        `UPDATE pendientes SET estado = 'resuelta', actualizado_en = ?
         WHERE clave = ? AND estado != 'resuelta'`,
      )
      .run(ahora, clavePendiente(palabra));
    return info.changes > 0;
  }

  marcarExportadas(ids: number[], ahora: string = new Date().toISOString()): void {
    if (ids.length === 0) return;
    const actualizar = this.db.prepare(
      `UPDATE pendientes SET estado = 'exportada', actualizado_en = ?
       WHERE rowid = ? AND estado = 'pendiente'`,
    );
    const todas = this.db.transaction((lista: number[]) => {
      for (const id of lista) actualizar.run(ahora, id);
    });
    todas(ids);
  }
}

function mapear(f: any): Pendiente {
  return {
    id: f.id,
    palabra: f.palabra,
    idioma: f.idioma,
    contexto: f.contexto,
    vecesPedida: f.veces_pedida,
    estado: f.estado,
    origen: f.origen,
    creadoEn: f.creado_en,
    actualizadoEn: f.actualizado_en,
  };
}
