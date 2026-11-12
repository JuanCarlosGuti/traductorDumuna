import { Inject, Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { DB_CONNECTION } from '../database/database.constants';
import { TranslationDirection } from './dto/translation.dto';

export type ValidationOrigin = 'confirmada' | 'corregida';

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
        `INSERT INTO validadas (creado_en, espanol, damana, direccion, origen, traduccion_modelo)
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
    return (this.db.prepare('SELECT COUNT(*) AS n FROM validadas').get() as { n: number }).n;
  }

  listAll(): ValidatedPair[] {
    return (
      this.db
        .prepare(
          `SELECT rowid AS id, creado_en, espanol, damana, direccion, origen, traduccion_modelo
           FROM validadas ORDER BY rowid`,
        )
        .all() as any[]
    ).map((f) => ({
      id: f.id,
      createdAt: f.creado_en,
      spanish: f.espanol,
      damana: f.damana,
      direction: f.direccion,
      origin: f.origen,
      modelTranslation: f.traduccion_modelo,
    }));
  }
}
