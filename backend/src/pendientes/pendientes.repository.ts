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

/** Clave de deduplicación: minúsculas y sin tildes, con ʉ y ñ intactas. */
export function clavePendiente(palabra: string): string {
  return normalizar(palabra.trim());
}

/**
 * Palabras que le faltan al traductor. La tabla sobrevive a las
 * reimportaciones: es el puente entre lo que piden los usuarios y lo que
 * las hablantes nativas llenan en el formato de elicitación.
 */
@Injectable()
export class PendientesRepository {
  constructor(@Inject(CONEXION_DB) private readonly db: Database) {}

  /** Todas, las más pedidas primero (y entre iguales, la más reciente). */
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

  /** Las que todavía no han vuelto resueltas: lo que se exporta a las nativas. */
  listarAbiertas(): Pendiente[] {
    return this.listar().filter((p) => p.estado !== 'resuelta');
  }

  /**
   * El traductor no encontró equivalente para esta palabra: se registra o,
   * si ya estaba, suma una petición. Una palabra ya resuelta que vuelve a
   * pedirse se reabre (señal de que la solución no llegó al corpus).
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
   * Fila de elicitación que volvió sin llenar. No suma peticiones ni pisa
   * lo que ya hubiera: solo garantiza que la palabra figure como pendiente.
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

  /** La palabra llegó traducida: se cierra si estaba abierta. */
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
