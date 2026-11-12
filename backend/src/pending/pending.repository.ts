import { Inject, Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { normalize } from '../common/text/normalizer';
import { DB_CONNECTION } from '../database/database.constants';

export type PendingLanguage = 'espanol' | 'damana';
export type PendingStatus = 'pendiente' | 'exportada' | 'resuelta';
export type PendingOrigin = 'traductor' | 'elicitacion';

export interface PendingItem {
  id: number;
  palabra: string;
  idioma: PendingLanguage;
  contexto: string | null;
  vecesPedida: number;
  estado: PendingStatus;
  origen: PendingOrigin;
  creadoEn: string;
  actualizadoEn: string;
}

/** Deduplication key: lowercase and no accents, with ʉ and ñ intact. */
export function pendingKey(word: string): string {
  return normalize(word.trim());
}

/**
 * Words the translator is missing. The table survives
 * re-imports: it is the bridge between what users ask for and what
 * the native speakers fill in on the elicitation format.
 */
@Injectable()
export class PendingRepository {
  constructor(@Inject(DB_CONNECTION) private readonly db: Database) {}

  /** All of them, most requested first (and among equals, the most recent). */
  listAll(): PendingItem[] {
    return (
      this.db
        .prepare(
          `SELECT rowid AS id, palabra, idioma, contexto, veces_pedida, estado, origen,
                  creado_en, actualizado_en
           FROM pendientes
           ORDER BY veces_pedida DESC, actualizado_en DESC, rowid`,
        )
        .all() as any[]
    ).map(mapRow);
  }

  /** Those that have not come back resolved yet: what is exported to the native speakers. */
  listOpen(): PendingItem[] {
    return this.listAll().filter((p) => p.estado !== 'resuelta');
  }

  /**
   * The translator found no equivalent for this word: it is recorded or,
   * if it was already there, one request is added. An already resolved word that is
   * requested again is reopened (a sign that the solution did not reach the corpus).
   */
  recordRequested(
    word: string,
    language: PendingLanguage,
    context: string | null,
    now: string = new Date().toISOString(),
  ): void {
    const clean = word.trim();
    if (!clean) return;
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
      .run(pendingKey(clean), clean, language, context, now, now);
  }

  /**
   * Elicitation row that came back unfilled. It does not add requests or overwrite
   * what was already there: it only guarantees the word is listed as pending.
   */
  recordFromElicitation(
    word: string,
    context: string | null,
    now: string = new Date().toISOString(),
  ): boolean {
    const clean = word.trim();
    if (!clean) return false;
    const info = this.db
      .prepare(
        `INSERT INTO pendientes
           (clave, palabra, idioma, contexto, veces_pedida, estado, origen, creado_en, actualizado_en)
         VALUES (?, ?, 'espanol', ?, 1, 'pendiente', 'elicitacion', ?, ?)
         ON CONFLICT(clave) DO NOTHING`,
      )
      .run(pendingKey(clean), clean, context || null, now, now);
    return info.changes > 0;
  }

  /** The word arrived translated: it is closed if it was open. */
  markResolved(word: string, now: string = new Date().toISOString()): boolean {
    const info = this.db
      .prepare(
        `UPDATE pendientes SET estado = 'resuelta', actualizado_en = ?
         WHERE clave = ? AND estado != 'resuelta'`,
      )
      .run(now, pendingKey(word));
    return info.changes > 0;
  }

  markExported(ids: number[], now: string = new Date().toISOString()): void {
    if (ids.length === 0) return;
    const update = this.db.prepare(
      `UPDATE pendientes SET estado = 'exportada', actualizado_en = ?
       WHERE rowid = ? AND estado = 'pendiente'`,
    );
    const all = this.db.transaction((list: number[]) => {
      for (const id of list) update.run(now, id);
    });
    all(ids);
  }
}

function mapRow(f: any): PendingItem {
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
