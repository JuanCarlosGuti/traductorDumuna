import Database from 'better-sqlite3';
import { Language } from './query.enums';
import { CorpusRepository } from './corpus.repository';
import { runMigrations } from '../database/migrations';
import {
  isUntranslatedPair,
  LEMMA_WEIGHT,
  REVIEW_WEIGHT,
  RetrievalService,
} from './retrieval.service';

describe('isUntranslatedPair', () => {
  it('detects biblical references (Damana identical to the Spanish)', () => {
    const ref = 'Génesis 1:27-31; Salmo 115:16.';
    expect(isUntranslatedPair(ref, ref)).toBe(true);
  });

  it('detects loose proper names and tolerates spaces and accents', () => {
    expect(isUntranslatedPair(' Felipe ', 'Felipe')).toBe(true);
    expect(isUntranslatedPair('Simon', 'Simón')).toBe(true); // normalizing removes accents
  });

  it('does NOT flag genuinely translated pairs (case with ʉ and ñ)', () => {
    expect(isUntranslatedPair('nʉnka ñingui', 'es otra vez')).toBe(false);
  });

  it('does NOT flag an empty pair as untranslated', () => {
    expect(isUntranslatedPair('', '')).toBe(false);
  });
});

describe('RetrievalService (corpus v3)', () => {
  let db: Database.Database;
  let service: RetrievalService;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    const insSentence = db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
       VALUES (?, ?, ?, ?, 'lfb')`,
    );
    // Same Damana text with different states → weight test
    insSentence.run('a1', 'nʉnka shkua gontka', 'el agua es una', 'aprobado');
    insSentence.run('r1', 'nʉnka shkua gontka', 'el agua es una', 'revisar');
    insSentence.run('a2', 'guma sheka dzʉwa', 'otra cosa distinta', 'aprobado');
    db.prepare(
      `INSERT INTO frases (fuente, damana, espanol, notas)
       VALUES ('Prueba', 'ñingui tua ukurra', 'otra vez al monte', NULL)`,
    ).run();
    db.prepare(
      `INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente)
       VALUES ('agua', 'nʉnka', 'Otros', NULL, 'dic')`,
    ).run();
    db.prepare(
      `INSERT INTO conjugaciones (damana, espanol, lema, fuente, notas)
       VALUES ('nujkunʉnanka', 'yo tuve', 'tener', 'doc', NULL)`,
    ).run();
    service = new RetrievalService(new CorpusRepository(db));
  });

  afterEach(() => db.close());

  it('retrieves sentences by Damana with ʉ intact and descending scores', () => {
    const results = service.similar('nʉnka shkua', Language.damana, 8);
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (const r of results) {
      expect(r.damana).toContain('nʉnka');
    }
    const scores = results.map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('a sentence with estado=revisar scores half the identical approved one and comes after it', () => {
    const results = service.similar('nʉnka shkua gontka', Language.damana, 8);
    const approved = results.find((r) => r.reference === 'oración 1')!;
    const review = results.find((r) => r.reference === 'oración 2 (revisar)')!;
    expect(approved).toBeDefined();
    expect(review).toBeDefined();
    expect(review.score).toBeCloseTo(approved.score * REVIEW_WEIGHT, 10);
    expect(results.indexOf(approved)).toBeLessThan(results.indexOf(review));
  });

  it('the vocabulary does NOT take part in retrieval (it goes separately in the prompt)', () => {
    const results = service.similar('nʉnka', Language.damana, 8);
    expect(results.some((r) => r.source === 'vocabulario')).toBe(false);
    expect(results.length).toBeGreaterThan(0); // but it does find sentences
  });

  it('conjugations do take part (case with ʉ in the verb form)', () => {
    const results = service.similar('nujkunʉnanka', Language.damana, 8);
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('conjugaciones');
    expect(results[0].reference).toBe('conjugación 1 (tener)');
    expect(results[0].spanish).toBe('yo tuve');
  });

  it('never confuses ʉ with u: searching "nunka" retrieves nothing', () => {
    expect(service.similar('nunka', Language.damana)).toEqual([]);
  });

  it('retrieves by Spanish and brings the parallel Damana (case with ñ in Damana)', () => {
    const results = service.similar('otra vez al monte', Language.espanol, 8);
    expect(results[0].damana).toBe('ñingui tua ukurra');
  });

  it('respects the limit k', () => {
    expect(service.similar('nʉnka shkua gontka', Language.damana, 1)).toHaveLength(1);
  });

  describe('verb lemma expansion', () => {
    /** Corpus with the verb «leer» in two different persons. */
    const prepareVerb = () => {
      db.prepare(
        `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
         VALUES ('v1', 'Ima texto nʉjkasheshisha ushi', 'Léeme este texto', 'aprobado', 'lfb')`,
      ).run();
      db.prepare(
        `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
         VALUES ('v2', 'Ima texto mʉjkasheshisha awʉnga', 'Te voy a leer este texto', 'aprobado', 'lfb')`,
      ).run();
      const ins = db.prepare(
        `INSERT INTO conjugaciones (damana, espanol, lema, fuente, notas)
         VALUES (?, ?, 'leer', 'doc', NULL)`,
      );
      ins.run('nʉjkasheshisha', 'me lee');
      ins.run('mʉjkasheshisha', 'te lee');
      ins.run('naijkasheshisha', 'nos lee'); // this one does NOT appear in the corpus
      return new RetrievalService(new CorpusRepository(db));
    };

    it('finds sentences with another conjugation of the same verb', () => {
      const service = prepareVerb();
      // 'naijkasheshisha' is in no sentence: it used to return 0 results
      const results = service.similar('naijkasheshisha', Language.damana, 8);
      const sentences = results.filter((r) => r.source === 'oraciones');
      expect(sentences.length).toBeGreaterThan(0);
      expect(sentences.every((r) => r.byLemma === 'leer')).toBe(true);
    });

    it('a direct match beats a verbal relative', () => {
      const service = prepareVerb();
      const results = service.similar('nʉjkasheshisha', Language.damana, 8);
      const direct = results.find((r) => r.damana.includes('nʉjkasheshisha'))!;
      const byLemma = results.find((r) => r.damana.includes('mʉjkasheshisha'))!;
      expect(direct.score).toBeGreaterThan(byLemma.score);
      expect(direct.byLemma).toBeUndefined();
      expect(byLemma.byLemma).toBe('leer');
    });

    it('the relative never outranks the direct match of the conjugation', () => {
      const service = prepareVerb();
      const results = service.similar('naijkasheshisha', Language.damana, 8);
      // The conjugations entry itself matches directly (1.0);
      // sentences arrive via the lemma and are discounted by LEMMA_WEIGHT.
      const direct = results.find((r) => r.source === 'conjugaciones')!;
      const byLemma = results.filter((r) => r.source === 'oraciones');
      expect(direct.byLemma).toBeUndefined();
      expect(results.indexOf(direct)).toBe(0);
      for (const r of byLemma) {
        expect(r.score).toBeLessThanOrEqual(LEMMA_WEIGHT);
        expect(r.score).toBeLessThan(direct.score);
      }
    });

    it('does not bring sibling conjugations: they would take slots without teaching context', () => {
      const service = prepareVerb();
      const results = service.similar('naijkasheshisha', Language.damana, 8);
      const conjugations = results.filter((r) => r.source === 'conjugaciones');
      expect(conjugations).toHaveLength(1); // only the direct match
      expect(conjugations[0].damana).toBe('naijkasheshisha');
      expect(conjugations[0].byLemma).toBeUndefined();
    });

    it('without verbs in the query the result does not change', () => {
      const service = prepareVerb();
      const results = service.similar('nʉnka shkua gontka', Language.damana, 8);
      expect(results.every((r) => r.byLemma === undefined)).toBe(true);
    });

    it('does not expand in the Spanish direction (lemmas are for Damana forms)', () => {
      const service = prepareVerb();
      const results = service.similar('leer este texto', Language.espanol, 8);
      expect(results.every((r) => r.byLemma === undefined)).toBe(true);
    });
  });

  it('excludes untranslated pairs (biblical references) from the index', () => {
    const reference = 'Genesis 1:27-31; Salmo 115:16.';
    db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
       VALUES ('ref1', ?, ?, 'aprobado', 'lfb')`,
    ).run(reference, reference);
    // Legitimate sentence that shares vocabulary with the query, to
    // check that the filter does not wipe out the good ones.
    db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
       VALUES ('ok1', 'Salmo nʉnka gontka', 'el Salmo dice', 'aprobado', 'lfb')`,
    ).run();
    const newService = new RetrievalService(new CorpusRepository(db));

    const results = newService.similar('Genesis Salmo', Language.damana, 8);
    expect(results.some((r) => r.damana === reference)).toBe(false);
    expect(results.some((r) => r.damana === 'Salmo nʉnka gontka')).toBe(true);
  });
});
