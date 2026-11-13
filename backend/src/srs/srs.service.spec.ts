import { NotFoundException } from '@nestjs/common';
import Database from 'better-sqlite3';
import { SearchService } from '../query/search.service';
import { CorpusRepository } from '../query/corpus.repository';
import { FrequenciesService } from '../query/frequencies.service';
import { WordService } from '../query/word.service';
import { RetrievalService } from '../query/retrieval.service';
import { runMigrations } from '../database/migrations';
import { Grade } from './sm2';
import { SrsService } from './srs.service';

describe('SrsService', () => {
  let db: Database.Database;
  let service: SrsService;
  const day0 = new Date('2026-07-08T10:00:00.000Z');
  const days = (n: number) => new Date(day0.getTime() + n * 24 * 60 * 60 * 1000);

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    // Vocabulary: entries with ʉ and with ñ
    db.prepare(
      "INSERT INTO vocabulary (spanish, damana, notes) VALUES ('agua', 'nʉnka', NULL)",
    ).run();
    db.prepare(
      "INSERT INTO vocabulary (spanish, damana, notes) VALUES ('otra vez', 'ñingui', NULL)",
    ).run();
    // Phrase so that 'gontka' exists as a frequent word with a parallel
    db.prepare(
      "INSERT INTO phrases (source, damana, spanish, notes) VALUES ('Prueba', 'gontka nanu', 'hizo esto aqui', NULL)",
    ).run();
    const insToken = db.prepare(
      `INSERT INTO damana_tokens (normalized_word, original_word, source_table, source_id, position)
       VALUES (?, ?, 'phrases', 1, ?)`,
    );
    insToken.run('gontka', 'gontka', 0);
    insToken.run('gontka', 'gontka', 1);
    insToken.run('nanu', 'nanu', 2);

    const repo = new CorpusRepository(db);
    service = new SrsService(
      db,
      repo,
      new FrequenciesService(repo),
      new WordService(repo, new SearchService(repo, new RetrievalService(repo))),
    );
  });

  afterEach(() => db.close());

  it('no progress: serves the vocabulary first as new cards', () => {
    const status = service.nextCard(day0);
    expect(status.card).toMatchObject({
      word: 'nʉnka',
      type: 'vocabulary',
      translation: 'agua',
      repetitions: 0,
    });
    expect(status.pendingCards).toBe(0);
    // 2 from vocabulary + 2 frequent (gontka, nanu)
    expect(status.newCards).toBe(4);
  });

  it('frequent words carry candidate translations as the back', () => {
    service.answer('nʉnka', Grade.good, day0);
    service.answer('ñingui', Grade.good, day0);
    const status = service.nextCard(day0);
    expect(status.card!.word).toBe('gontka');
    expect(status.card!.type).toBe('frequency');
    expect(status.card!.translation).toContain('hizo'); // 'esto'/'aqui' are candidates too
  });

  it('answering "bien" schedules the review and the card is due the next day', () => {
    const r = service.answer('nʉnka', Grade.good, day0);
    expect(r.intervalDays).toBe(1);

    // Just answered: no longer pending today
    expect(service.nextCard(day0).pendingCards).toBe(0);
    // The next day it is due and comes back first
    const tomorrow = service.nextCard(days(1.1));
    expect(tomorrow.pendingCards).toBe(1);
    expect(tomorrow.card!.word).toBe('nʉnka');
    expect(tomorrow.card!.repetitions).toBe(1);
  });

  it('"otra vez" makes the card due immediately (case with ñ)', () => {
    service.answer('ñingui', Grade.again, day0);
    const status = service.nextCard(day0);
    expect(status.pendingCards).toBe(1);
    expect(status.card!.word).toBe('ñingui');
  });

  it('prioritizes the oldest overdue card', () => {
    service.answer('nʉnka', Grade.good, day0); // due day 1
    service.answer('ñingui', Grade.good, days(0.5)); // due day 1.5
    const status = service.nextCard(days(2));
    expect(status.pendingCards).toBe(2);
    expect(status.card!.word).toBe('nʉnka');
  });

  it('rejects words outside the deck', () => {
    expect(() =>
      service.answer('inexistente', Grade.good, day0),
    ).toThrow(NotFoundException);
  });

  it('progress survives a re-import (DELETE of corpus tables)', () => {
    service.answer('nʉnka', Grade.good, day0);
    db.exec('DELETE FROM damana_tokens'); // what the importer does
    const row = db
      .prepare('SELECT repetitions FROM srs_progress WHERE word = ?')
      .get('nʉnka') as { repetitions: number };
    expect(row.repetitions).toBe(1);
  });
});
