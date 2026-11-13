import { Inject, Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { DB_CONNECTION } from '../database/database.constants';
import { TranslationDirection } from './dto/translation.dto';

export type ValidationOrigin = 'confirmed' | 'corrected';

export interface ValidatedPair {
  id: number;
  createdAt: string;
  spanish: string;
  damana: string;
  direction: TranslationDirection;
  origin: ValidationOrigin;
  modelTranslation: string | null;
}

export interface NewValidated {
  spanish: string;
  damana: string;
  direction: TranslationDirection;
  origin: ValidationOrigin;
  /** What the model proposed (equal to the pair if it was confirmed). */
  modelTranslation: string | null;
}

/**
 * Pairs the user accepted as good («this translation is correct») or
 * corrected by hand. It is the future everyday source of highest confidence; for
 * now it only accumulates. It survives re-imports.
 */
@Injectable()
export class ValidatedRepository {
  constructor(@Inject(DB_CONNECTION) private readonly db: Database) {}

  save(newItem: NewValidated, now: Date = new Date()): void {
    this.db
      .prepare(
        `INSERT INTO validated_pairs (created_at, spanish, damana, direction, origin, model_translation)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        now.toISOString(),
        newItem.spanish,
        newItem.damana,
        newItem.direction,
        newItem.origin,
        newItem.modelTranslation,
      );
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM validated_pairs').get() as { n: number }).n;
  }

  listAll(): ValidatedPair[] {
    return (
      this.db
        .prepare(
          `SELECT rowid AS id, created_at, spanish, damana, direction, origin, model_translation
           FROM validated_pairs ORDER BY rowid`,
        )
        .all() as any[]
    ).map((f) => ({
      id: f.id,
      createdAt: f.created_at,
      spanish: f.spanish,
      damana: f.damana,
      direction: f.direction,
      origin: f.origin,
      modelTranslation: f.model_translation,
    }));
  }
}
