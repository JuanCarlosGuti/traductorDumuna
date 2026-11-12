import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { FrequenciesService } from '../query/frequencies.service';
import { WordService } from '../query/word.service';
import { CorpusRepository } from '../query/corpus.repository';
import { DB_CONNECTION } from '../database/database.constants';
import {
  SrsStatusDto,
  UpdatedProgressDto,
  SrsCardDto,
} from './dto/srs.dto';
import { applySm2, Grade, INITIAL_SM2_STATE, Sm2State } from './sm2';

const TOP_FREQUENCIES = 300;
const MAX_CARD_CANDIDATES = 3;

interface PoolCard {
  word: string;
  type: 'vocabulario' | 'frecuencia';
  translation?: string;
}

interface ProgressRow {
  palabra: string;
  repeticiones: number;
  factor_facilidad: number;
  intervalo_dias: number;
  proxima_revision: string;
}

@Injectable()
export class SrsService {
  constructor(
    @Inject(DB_CONNECTION) private readonly db: Database,
    private readonly repo: CorpusRepository,
    private readonly frequencies: FrequenciesService,
    private readonly wordService: WordService,
  ) {}

  /**
   * Next card to review: first the overdue ones (oldest
   * proxima_revision), then the never-seen ones (vocabulary first, then the
   * TOP_FREQUENCIES most frequent words in frequency order).
   */
  nextCard(now: Date = new Date()): SrsStatusDto {
    const pool = this.pool();
    const progressRows = this.progressByWord();

    const overdue = pool
      .filter((c) => {
        const p = progressRows.get(c.word);
        return p !== undefined && p.proxima_revision <= now.toISOString();
      })
      .sort((a, b) =>
        progressRows
          .get(a.word)!
          .proxima_revision.localeCompare(progressRows.get(b.word)!.proxima_revision),
      );
    const newItems = pool.filter((c) => !progressRows.has(c.word));

    const card = overdue[0] ?? newItems[0] ?? null;
    return {
      card: card ? this.buildCard(card, progressRows.get(card.word)) : null,
      pendingCards: overdue.length,
      newCards: newItems.length,
    };
  }

  answer(
    word: string,
    grade: Grade,
    now: Date = new Date(),
  ): UpdatedProgressDto {
    if (!this.pool().some((c) => c.word === word)) {
      throw new NotFoundException(
        `La palabra "${word}" no está en el mazo de repaso`,
      );
    }

    const row = this.db
      .prepare('SELECT * FROM progreso_srs WHERE palabra = ?')
      .get(word) as ProgressRow | undefined;
    const status: Sm2State = row
      ? {
          repetitions: row.repeticiones,
          easeFactor: row.factor_facilidad,
          intervalDays: row.intervalo_dias,
        }
      : INITIAL_SM2_STATE;

    const newValue = applySm2(status, grade);
    const next = new Date(
      now.getTime() + newValue.intervalDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    this.db
      .prepare(
        `INSERT INTO progreso_srs
           (palabra, repeticiones, factor_facilidad, intervalo_dias, proxima_revision, actualizado_en)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(palabra) DO UPDATE SET
           repeticiones = excluded.repeticiones,
           factor_facilidad = excluded.factor_facilidad,
           intervalo_dias = excluded.intervalo_dias,
           proxima_revision = excluded.proxima_revision,
           actualizado_en = excluded.actualizado_en`,
      )
      .run(
        word,
        newValue.repetitions,
        newValue.easeFactor,
        newValue.intervalDays,
        next,
        now.toISOString(),
      );

    return {
      word: word,
      repetitions: newValue.repetitions,
      intervalDays: newValue.intervalDays,
      nextReview: next,
    };
  }

  /** Deck: the whole vocabulary + the 300 most frequent words (no duplicates). */
  private pool(): PoolCard[] {
    const vocabulary: PoolCard[] = this.repo.listVocabulary().map((v) => ({
      word: v.damana,
      type: 'vocabulario',
      translation: v.spanish,
    }));
    const inVocabulary = new Set(vocabulary.map((c) => c.word));
    const frequent: PoolCard[] = this.frequencies
      .listAll(TOP_FREQUENCIES)
      .filter((f) => !inVocabulary.has(f.word))
      .map((f) => ({ word: f.word, type: 'frecuencia' }));
    return [...vocabulary, ...frequent];
  }

  private progressByWord(): Map<string, ProgressRow> {
    const rows = this.db
      .prepare('SELECT * FROM progreso_srs')
      .all() as ProgressRow[];
    return new Map(rows.map((f) => [f.palabra, f]));
  }

  private buildCard(card: PoolCard, progress?: ProgressRow): SrsCardDto {
    let translation = card.translation;
    if (translation === undefined) {
      // Frequent word without a vocabulary entry: the back shows its
      // candidate translations by co-occurrence.
      const candidateWords = this.wordService
        .wordCard(card.word)
        .candidateTranslations.slice(0, MAX_CARD_CANDIDATES)
        .map((c) => c.word);
      translation =
        candidateWords.length > 0
          ? `candidatas: ${candidateWords.join(', ')}`
          : '(sin traducciones candidatas)';
    }
    return {
      word: card.word,
      type: card.type,
      translation: translation,
      repetitions: progress?.repeticiones ?? 0,
    };
  }
}
