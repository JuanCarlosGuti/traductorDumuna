import Database from 'better-sqlite3';
import { runMigrations } from '../database/migraciones';
import { SearchService } from './busqueda.service';
import { CorpusSource, Language } from './consulta.enums';
import { CorpusRepository } from './corpus.repository';
import { RetrievalService } from './retrieval.service';

describe('SearchService', () => {
  let db: Database.Database;
  let service: SearchService;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
       VALUES ('o1', 'Jehovága nʉnka kʉñingui gontka', 'Jehová hizo el agua', 'aprobado', 'lfb')`,
    ).run();
    db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
       VALUES ('o2', 'ñingui tua ukurra', 'otra vez al monte', 'revisar', 'lfb')`,
    ).run();
    db.prepare(
      `INSERT INTO frases (fuente, damana, espanol, notas)
       VALUES ('Prueba', '¿Zhinzhoma nʉnka nanu?', '¿Conoces el agua?', NULL)`,
    ).run();
    db.prepare(
      `INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente)
       VALUES ('agua', 'nʉnka', 'Otros', NULL, 'dic')`,
    ).run();
    db.prepare(
      `INSERT INTO conjugaciones (damana, espanol, lema, fuente, notas)
       VALUES ('nʉnkanka', 'él fue', 'ser', 'doc', NULL)`,
    ).run();
    const repo = new CorpusRepository(db);
    service = new SearchService(repo, new RetrievalService(repo));
  });

  afterEach(() => db.close());

  it('finds in Damana across the four sources, with <mark> and ʉ intact', () => {
    const r = service.search({ q: 'nʉnka', idioma: Language.damana, limite: 100 });
    expect(r.modo).toBe('concordancia');
    expect(r.total).toBe(3); // sentence 1, phrase, vocabulary (nʉnkanka does NOT match nʉnka)
    expect(r.resultados.map((c) => c.fuente)).toEqual([
      CorpusSource.oraciones,
      CorpusSource.frases,
      CorpusSource.vocabulario,
    ]);
    for (const c of r.resultados) {
      expect(c.fragmento).toContain('<mark>nʉnka</mark>');
    }
  });

  it('conjugations are searchable with the reference «conjugación N (lema)»', () => {
    const r = service.search({ q: 'nʉnkanka', idioma: Language.damana, limite: 10 });
    expect(r.total).toBe(1);
    expect(r.resultados[0].fuente).toBe(CorpusSource.conjugaciones);
    expect(r.resultados[0].referencia).toBe('conjugación 1 (ser)');
    expect(r.resultados[0].textoParalelo).toBe('él fue');
  });

  it('does not confuse ʉ with u or ñ with n', () => {
    expect(service.search({ q: 'nunka', idioma: Language.damana, limite: 10 }).total).toBe(0);
    expect(service.search({ q: 'ningui', idioma: Language.damana, limite: 10 }).total).toBe(0);
    expect(service.search({ q: 'ñingui', idioma: Language.damana, limite: 10 }).total).toBe(1);
  });

  it('searches in Spanish without accents and returns the Damana as parallel', () => {
    const r = service.search({ q: 'jehova', idioma: Language.espanol, limite: 10 });
    expect(r.total).toBe(1);
    expect(r.resultados[0].fragmento).toContain('<mark>Jehová</mark>');
    expect(r.resultados[0].textoParalelo).toContain('Jehovága');
  });

  it('filters by source', () => {
    const r = service.search({
      q: 'nʉnka',
      idioma: Language.damana,
      fuente: CorpusSource.frases,
      limite: 10,
    });
    expect(r.total).toBe(1);
    expect(r.resultados[0].referencia).toBe('frase 1 (Prueba)');
  });

  it('a sentence reference marks the revisar state', () => {
    const r = service.search({ q: 'ñingui', idioma: Language.damana, limite: 10 });
    expect(r.resultados[0].referencia).toBe('oración 2 (revisar)');
  });

  it('respects the limit but reports the real total', () => {
    const r = service.search({ q: 'nʉnka', idioma: Language.damana, limite: 2 });
    expect(r.total).toBe(3);
    expect(r.resultados).toHaveLength(2);
  });

  describe('similarity mode (multi-word queries)', () => {
    it('a Damana phrase returns similar sentences with score and highlighted words', () => {
      const r = service.search({
        q: 'nʉnka kʉñingui',
        idioma: Language.damana,
        limite: 10,
      });
      expect(r.modo).toBe('similitud');
      expect(r.total).toBeGreaterThan(0);
      const firstItem = r.resultados[0];
      expect(firstItem.referencia).toBe('oración 1');
      expect(firstItem.puntaje).toBeGreaterThan(0);
      // both words of the query are highlighted
      expect(firstItem.fragmento).toContain('<mark>nʉnka</mark>');
      expect(firstItem.fragmento).toContain('<mark>kʉñingui</mark>');
      expect(firstItem.textoParalelo).toBe('Jehová hizo el agua');
    });

    it('a Spanish phrase finds by similarity (accent-insensitive)', () => {
      const r = service.search({
        q: 'jehova hizo agua',
        idioma: Language.espanol,
        limite: 10,
      });
      expect(r.modo).toBe('similitud');
      expect(r.resultados[0].referencia).toBe('oración 1');
      expect(r.resultados[0].fragmento).toContain('<mark>Jehová</mark>');
      expect(r.resultados[0].fragmento).toContain('<mark>agua</mark>');
      expect(r.resultados[0].textoParalelo).toContain('Jehovága');
    });

    it('filters by source in similarity mode too', () => {
      const r = service.search({
        q: 'nʉnka nanu',
        idioma: Language.damana,
        fuente: CorpusSource.frases,
        limite: 10,
      });
      expect(r.modo).toBe('similitud');
      for (const c of r.resultados) {
        expect(c.fuente).toBe(CorpusSource.frases);
      }
    });

    it('a phrase with no corpus words returns empty without breaking', () => {
      const r = service.search({
        q: 'zzz www qqq',
        idioma: Language.damana,
        limite: 10,
      });
      expect(r.modo).toBe('similitud');
      expect(r.total).toBe(0);
      expect(r.resultados).toEqual([]);
    });
  });
});
