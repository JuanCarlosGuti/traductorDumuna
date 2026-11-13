import Database from 'better-sqlite3';
import { runMigrations } from '../database/migrations';
import { SearchService } from './search.service';
import { CorpusSource, Language } from './query.enums';
import { CorpusRepository } from './corpus.repository';
import { RetrievalService } from './retrieval.service';

describe('SearchService', () => {
  let db: Database.Database;
  let service: SearchService;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    db.prepare(
      `INSERT INTO sentences (external_id, damana, spanish, status, source)
       VALUES ('o1', 'Jehovága nʉnka kʉñingui gontka', 'Jehová hizo el agua', 'approved', 'lfb')`,
    ).run();
    db.prepare(
      `INSERT INTO sentences (external_id, damana, spanish, status, source)
       VALUES ('o2', 'ñingui tua ukurra', 'otra vez al monte', 'review', 'lfb')`,
    ).run();
    db.prepare(
      `INSERT INTO phrases (source, damana, spanish, notes)
       VALUES ('Prueba', '¿Zhinzhoma nʉnka nanu?', '¿Conoces el agua?', NULL)`,
    ).run();
    db.prepare(
      `INSERT INTO vocabulary (spanish, damana, category, notes, source)
       VALUES ('agua', 'nʉnka', 'Otros', NULL, 'dic')`,
    ).run();
    db.prepare(
      `INSERT INTO conjugations (damana, spanish, lemma, source, notes)
       VALUES ('nʉnkanka', 'él fue', 'ser', 'doc', NULL)`,
    ).run();
    const repo = new CorpusRepository(db);
    service = new SearchService(repo, new RetrievalService(repo));
  });

  afterEach(() => db.close());

  it('finds in Damana across the four sources, with <mark> and ʉ intact', () => {
    const r = service.search({ q: 'nʉnka', language: Language.damana, limit: 100 });
    expect(r.mode).toBe('concordance');
    expect(r.total).toBe(3); // sentence 1, phrase, vocabulary (nʉnkanka does NOT match nʉnka)
    expect(r.results.map((c) => c.source)).toEqual([
      CorpusSource.sentences,
      CorpusSource.phrases,
      CorpusSource.vocabulary,
    ]);
    for (const c of r.results) {
      expect(c.fragment).toContain('<mark>nʉnka</mark>');
    }
  });

  it('conjugations are searchable with the reference «conjugación N (lema)»', () => {
    const r = service.search({ q: 'nʉnkanka', language: Language.damana, limit: 10 });
    expect(r.total).toBe(1);
    expect(r.results[0].source).toBe(CorpusSource.conjugations);
    expect(r.results[0].reference).toBe('conjugación 1 (ser)');
    expect(r.results[0].parallelText).toBe('él fue');
  });

  it('does not confuse ʉ with u or ñ with n', () => {
    expect(service.search({ q: 'nunka', language: Language.damana, limit: 10 }).total).toBe(0);
    expect(service.search({ q: 'ningui', language: Language.damana, limit: 10 }).total).toBe(0);
    expect(service.search({ q: 'ñingui', language: Language.damana, limit: 10 }).total).toBe(1);
  });

  it('searches in Spanish without accents and returns the Damana as parallel', () => {
    const r = service.search({ q: 'jehova', language: Language.spanish, limit: 10 });
    expect(r.total).toBe(1);
    expect(r.results[0].fragment).toContain('<mark>Jehová</mark>');
    expect(r.results[0].parallelText).toContain('Jehovága');
  });

  it('filters by source', () => {
    const r = service.search({
      q: 'nʉnka',
      language: Language.damana,
      source: CorpusSource.phrases,
      limit: 10,
    });
    expect(r.total).toBe(1);
    expect(r.results[0].reference).toBe('frase 1 (Prueba)');
  });

  it('a sentence reference marks the revisar state', () => {
    const r = service.search({ q: 'ñingui', language: Language.damana, limit: 10 });
    expect(r.results[0].reference).toBe('oración 2 (revisar)');
  });

  it('respects the limit but reports the real total', () => {
    const r = service.search({ q: 'nʉnka', language: Language.damana, limit: 2 });
    expect(r.total).toBe(3);
    expect(r.results).toHaveLength(2);
  });

  describe('similarity mode (multi-word queries)', () => {
    it('a Damana phrase returns similar sentences with score and highlighted words', () => {
      const r = service.search({
        q: 'nʉnka kʉñingui',
        language: Language.damana,
        limit: 10,
      });
      expect(r.mode).toBe('similarity');
      expect(r.total).toBeGreaterThan(0);
      const firstItem = r.results[0];
      expect(firstItem.reference).toBe('oración 1');
      expect(firstItem.score).toBeGreaterThan(0);
      // both words of the query are highlighted
      expect(firstItem.fragment).toContain('<mark>nʉnka</mark>');
      expect(firstItem.fragment).toContain('<mark>kʉñingui</mark>');
      expect(firstItem.parallelText).toBe('Jehová hizo el agua');
    });

    it('a Spanish phrase finds by similarity (accent-insensitive)', () => {
      const r = service.search({
        q: 'jehova hizo agua',
        language: Language.spanish,
        limit: 10,
      });
      expect(r.mode).toBe('similarity');
      expect(r.results[0].reference).toBe('oración 1');
      expect(r.results[0].fragment).toContain('<mark>Jehová</mark>');
      expect(r.results[0].fragment).toContain('<mark>agua</mark>');
      expect(r.results[0].parallelText).toContain('Jehovága');
    });

    it('filters by source in similarity mode too', () => {
      const r = service.search({
        q: 'nʉnka nanu',
        language: Language.damana,
        source: CorpusSource.phrases,
        limit: 10,
      });
      expect(r.mode).toBe('similarity');
      for (const c of r.results) {
        expect(c.source).toBe(CorpusSource.phrases);
      }
    });

    it('a phrase with no corpus words returns empty without breaking', () => {
      const r = service.search({
        q: 'zzz www qqq',
        language: Language.damana,
        limit: 10,
      });
      expect(r.mode).toBe('similarity');
      expect(r.total).toBe(0);
      expect(r.results).toEqual([]);
    });
  });
});
