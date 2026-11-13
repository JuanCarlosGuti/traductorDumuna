import { Inject, Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { normalize } from '../common/text/normalizer';
import { DB_CONNECTION } from '../database/database.constants';

export type PendingLanguage = 'spanish' | 'damana';
export type PendingStatus = 'pending' | 'exported' | 'resolved';
export type PendingOrigin = 'translator' | 'elicitation';

export interface PendingItem {
  id: number;
  word: string;
  language: PendingLanguage;
  context: string | null;
  timesRequested: number;
  status: PendingStatus;
  origin: PendingOrigin;
  createdAt: string;
  updatedAt: string;
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
          `SELECT rowid AS id, word, language, context, times_requested, status, origin,
                  created_at, updated_at
           FROM pending_items
           ORDER BY times_requested DESC, updated_at DESC, rowid`,
        )
        .all() as any[]
    ).map(mapRow);
  }

  /** Those that have not come back resolved yet: what is exported to the native speakers. */
  listOpen(): PendingItem[] {
    return this.listAll().filter((p) => p.status !== 'resolved');
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
        `INSERT INTO pending_items
           (lookup_key, word, language, context, times_requested, status, origin, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, 'pending', 'translator', ?, ?)
         ON CONFLICT(lookup_key) DO UPDATE SET
           times_requested = times_requested + 1,
           context = COALESCE(pending_items.context, excluded.context),
           status = CASE WHEN pending_items.status = 'resolved' THEN 'pending' ELSE pending_items.status END,
           updated_at = excluded.updated_at`,
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
        `INSERT INTO pending_items
           (lookup_key, word, language, context, times_requested, status, origin, created_at, updated_at)
         VALUES (?, ?, 'spanish', ?, 1, 'pending', 'elicitation', ?, ?)
         ON CONFLICT(lookup_key) DO NOTHING`,
      )
      .run(pendingKey(clean), clean, context || null, now, now);
    return info.changes > 0;
  }

  /** The word arrived translated: it is closed if it was open. */
  markResolved(word: string, now: string = new Date().toISOString()): boolean {
    const info = this.db
      .prepare(
        `UPDATE pending_items SET status = 'resolved', updated_at = ?
         WHERE lookup_key = ? AND status != 'resolved'`,
      )
      .run(now, pendingKey(word));
    return info.changes > 0;
  }

  markExported(ids: number[], now: string = new Date().toISOString()): void {
    if (ids.length === 0) return;
    const update = this.db.prepare(
      `UPDATE pending_items SET status = 'exported', updated_at = ?
       WHERE rowid = ? AND status = 'pending'`,
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
    word: f.word,
    language: f.language,
    context: f.context,
    timesRequested: f.times_requested,
    status: f.status,
    origin: f.origin,
    createdAt: f.created_at,
    updatedAt: f.updated_at,
  };
}
