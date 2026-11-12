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
  palabra: string;
  tipo: 'vocabulario' | 'frecuencia';
  traduccion?: string;
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
        const p = progressRows.get(c.palabra);
        return p !== undefined && p.proxima_revision <= now.toISOString();
      })
      .sort((a, b) =>
        progressRows
          .get(a.palabra)!
          .proxima_revision.localeCompare(progressRows.get(b.palabra)!.proxima_revision),
      );
    const newItems = pool.filter((c) => !progressRows.has(c.palabra));

    const card = overdue[0] ?? newItems[0] ?? null;
    return {
      tarjeta: card ? this.buildCard(card, progressRows.get(card.palabra)) : null,
      pendientes: overdue.length,
      nuevas: newItems.length,
    };
  }

  answer(
    word: string,
    grade: Grade,
    now: Date = new Date(),
  ): UpdatedProgressDto {
    if (!this.pool().some((c) => c.palabra === word)) {
      throw new NotFoundException(
        `La palabra "${word}" no está en el mazo de repaso`,
      );
    }

    const row = this.db
      .prepare('SELECT * FROM progreso_srs WHERE palabra = ?')
      .get(word) as ProgressRow | undefined;
    const status: Sm2State = row
      ? {
          repeticiones: row.repeticiones,
          factorFacilidad: row.factor_facilidad,
          intervaloDias: row.intervalo_dias,
        }
      : INITIAL_SM2_STATE;

    const newValue = applySm2(status, grade);
    const next = new Date(
      now.getTime() + newValue.intervaloDias * 24 * 60 * 60 * 1000,
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
        newValue.repeticiones,
        newValue.factorFacilidad,
        newValue.intervaloDias,
        next,
        now.toISOString(),
      );

    return {
      palabra: word,
      repeticiones: newValue.repeticiones,
      intervaloDias: newValue.intervaloDias,
      proximaRevision: next,
    };
  }

  /** Deck: the whole vocabulary + the 300 most frequent words (no duplicates). */
  private pool(): PoolCard[] {
    const vocabulary: PoolCard[] = this.repo.listVocabulary().map((v) => ({
      palabra: v.damana,
      tipo: 'vocabulario',
      traduccion: v.espanol,
    }));
    const inVocabulary = new Set(vocabulary.map((c) => c.palabra));
    const frequent: PoolCard[] = this.frequencies
      .listAll(TOP_FREQUENCIES)
      .filter((f) => !inVocabulary.has(f.palabra))
      .map((f) => ({ palabra: f.palabra, tipo: 'frecuencia' }));
    return [...vocabulary, ...frequent];
  }

  private progressByWord(): Map<string, ProgressRow> {
    const rows = this.db
      .prepare('SELECT * FROM progreso_srs')
      .all() as ProgressRow[];
    return new Map(rows.map((f) => [f.palabra, f]));
  }

  private buildCard(card: PoolCard, progress?: ProgressRow): SrsCardDto {
    let translation = card.traduccion;
    if (translation === undefined) {
      // Frequent word without a vocabulary entry: the back shows its
      // candidate translations by co-occurrence.
      const candidateWords = this.wordService
        .wordCard(card.palabra)
        .traduccionesCandidatas.slice(0, MAX_CARD_CANDIDATES)
        .map((c) => c.palabra);
      translation =
        candidateWords.length > 0
          ? `candidatas: ${candidateWords.join(', ')}`
          : '(sin traducciones candidatas)';
    }
    return {
      palabra: card.palabra,
      tipo: card.tipo,
      traduccion: translation,
      repeticiones: progress?.repeticiones ?? 0,
    };
  }
}
