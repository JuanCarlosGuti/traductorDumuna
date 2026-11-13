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
  type: 'vocabulary' | 'frequency';
  translation?: string;
}

interface ProgressRow {
  word: string;
  repetitions: number;
  ease_factor: number;
  interval_days: number;
  next_review: string;
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
   * next_review), then the never-seen ones (vocabulary first, then the
   * TOP_FREQUENCIES most frequent words in frequency order).
   */
  nextCard(now: Date = new Date()): SrsStatusDto {
    const pool = this.pool();
    const progressRows = this.progressByWord();

    const overdue = pool
      .filter((c) => {
        const p = progressRows.get(c.word);
        return p !== undefined && p.next_review <= now.toISOString();
      })
      .sort((a, b) =>
        progressRows
          .get(a.word)!
          .next_review.localeCompare(progressRows.get(b.word)!.next_review),
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
      .prepare('SELECT * FROM srs_progress WHERE word = ?')
      .get(word) as ProgressRow | undefined;
    const status: Sm2State = row
      ? {
          repetitions: row.repetitions,
          easeFactor: row.ease_factor,
          intervalDays: row.interval_days,
        }
      : INITIAL_SM2_STATE;

    const newValue = applySm2(status, grade);
    const next = new Date(
      now.getTime() + newValue.intervalDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    this.db
      .prepare(
        `INSERT INTO srs_progress
           (word, repetitions, ease_factor, interval_days, next_review, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(word) DO UPDATE SET
           repetitions = excluded.repetitions,
           ease_factor = excluded.ease_factor,
           interval_days = excluded.interval_days,
           next_review = excluded.next_review,
           updated_at = excluded.updated_at`,
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
      type: 'vocabulary',
      translation: v.spanish,
    }));
    const inVocabulary = new Set(vocabulary.map((c) => c.word));
    const frequent: PoolCard[] = this.frequencies
      .listAll(TOP_FREQUENCIES)
      .filter((f) => !inVocabulary.has(f.word))
      .map((f) => ({ word: f.word, type: 'frequency' }));
    return [...vocabulary, ...frequent];
  }

  private progressByWord(): Map<string, ProgressRow> {
    const rows = this.db
      .prepare('SELECT * FROM srs_progress')
      .all() as ProgressRow[];
    return new Map(rows.map((f) => [f.word, f]));
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
      repetitions: progress?.repetitions ?? 0,
    };
  }
}
