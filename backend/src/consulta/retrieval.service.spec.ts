import Database from 'better-sqlite3';
import { Idioma } from './consulta.enums';
import { CorpusRepository } from './corpus.repository';
import { ejecutarMigraciones } from '../database/migraciones';
import {
  esParSinTraduccion,
  PESO_LEMA,
  PESO_REVISAR,
  RetrievalService,
} from './retrieval.service';

describe('esParSinTraduccion', () => {
  it('detects biblical references (Damana identical to the Spanish)', () => {
    const ref = 'Génesis 1:27-31; Salmo 115:16.';
    expect(esParSinTraduccion(ref, ref)).toBe(true);
  });

  it('detects loose proper names and tolerates spaces and accents', () => {
    expect(esParSinTraduccion(' Felipe ', 'Felipe')).toBe(true);
    expect(esParSinTraduccion('Simon', 'Simón')).toBe(true); // normalizing removes accents
  });

  it('does NOT flag genuinely translated pairs (case with ʉ and ñ)', () => {
    expect(esParSinTraduccion('nʉnka ñingui', 'es otra vez')).toBe(false);
  });

  it('does NOT flag an empty pair as untranslated', () => {
    expect(esParSinTraduccion('', '')).toBe(false);
  });
});

describe('RetrievalService (corpus v3)', () => {
  let db: Database.Database;
  let servicio: RetrievalService;

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    const insOracion = db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
       VALUES (?, ?, ?, ?, 'lfb')`,
    );
    // Same Damana text with different states → weight test
    insOracion.run('a1', 'nʉnka shkua gontka', 'el agua es una', 'aprobado');
    insOracion.run('r1', 'nʉnka shkua gontka', 'el agua es una', 'revisar');
    insOracion.run('a2', 'guma sheka dzʉwa', 'otra cosa distinta', 'aprobado');
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
    servicio = new RetrievalService(new CorpusRepository(db));
  });

  afterEach(() => db.close());

  it('retrieves sentences by Damana with ʉ intact and descending scores', () => {
    const resultados = servicio.similares('nʉnka shkua', Idioma.damana, 8);
    expect(resultados.length).toBeGreaterThanOrEqual(2);
    for (const r of resultados) {
      expect(r.damana).toContain('nʉnka');
    }
    const puntajes = resultados.map((r) => r.puntaje);
    expect([...puntajes].sort((a, b) => b - a)).toEqual(puntajes);
  });

  it('a sentence with estado=revisar scores half the identical approved one and comes after it', () => {
    const resultados = servicio.similares('nʉnka shkua gontka', Idioma.damana, 8);
    const aprobada = resultados.find((r) => r.referencia === 'oración 1')!;
    const revisar = resultados.find((r) => r.referencia === 'oración 2 (revisar)')!;
    expect(aprobada).toBeDefined();
    expect(revisar).toBeDefined();
    expect(revisar.puntaje).toBeCloseTo(aprobada.puntaje * PESO_REVISAR, 10);
    expect(resultados.indexOf(aprobada)).toBeLessThan(resultados.indexOf(revisar));
  });

  it('the vocabulary does NOT take part in retrieval (it goes separately in the prompt)', () => {
    const resultados = servicio.similares('nʉnka', Idioma.damana, 8);
    expect(resultados.some((r) => r.fuente === 'vocabulario')).toBe(false);
    expect(resultados.length).toBeGreaterThan(0); // but it does find sentences
  });

  it('conjugations do take part (case with ʉ in the verb form)', () => {
    const resultados = servicio.similares('nujkunʉnanka', Idioma.damana, 8);
    expect(resultados).toHaveLength(1);
    expect(resultados[0].fuente).toBe('conjugaciones');
    expect(resultados[0].referencia).toBe('conjugación 1 (tener)');
    expect(resultados[0].espanol).toBe('yo tuve');
  });

  it('never confuses ʉ with u: searching "nunka" retrieves nothing', () => {
    expect(servicio.similares('nunka', Idioma.damana)).toEqual([]);
  });

  it('retrieves by Spanish and brings the parallel Damana (case with ñ in Damana)', () => {
    const resultados = servicio.similares('otra vez al monte', Idioma.espanol, 8);
    expect(resultados[0].damana).toBe('ñingui tua ukurra');
  });

  it('respects the limit k', () => {
    expect(servicio.similares('nʉnka shkua gontka', Idioma.damana, 1)).toHaveLength(1);
  });

  describe('verb lemma expansion', () => {
    /** Corpus with the verb «leer» in two different persons. */
    const prepararVerbo = () => {
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
      const servicio = prepararVerbo();
      // 'naijkasheshisha' is in no sentence: it used to return 0 results
      const resultados = servicio.similares('naijkasheshisha', Idioma.damana, 8);
      const oraciones = resultados.filter((r) => r.fuente === 'oraciones');
      expect(oraciones.length).toBeGreaterThan(0);
      expect(oraciones.every((r) => r.porLema === 'leer')).toBe(true);
    });

    it('a direct match beats a verbal relative', () => {
      const servicio = prepararVerbo();
      const resultados = servicio.similares('nʉjkasheshisha', Idioma.damana, 8);
      const directa = resultados.find((r) => r.damana.includes('nʉjkasheshisha'))!;
      const porLema = resultados.find((r) => r.damana.includes('mʉjkasheshisha'))!;
      expect(directa.puntaje).toBeGreaterThan(porLema.puntaje);
      expect(directa.porLema).toBeUndefined();
      expect(porLema.porLema).toBe('leer');
    });

    it('the relative never outranks the direct match of the conjugation', () => {
      const servicio = prepararVerbo();
      const resultados = servicio.similares('naijkasheshisha', Idioma.damana, 8);
      // The conjugations entry itself matches directly (1.0);
      // sentences arrive via the lemma and are discounted by PESO_LEMA.
      const directa = resultados.find((r) => r.fuente === 'conjugaciones')!;
      const porLema = resultados.filter((r) => r.fuente === 'oraciones');
      expect(directa.porLema).toBeUndefined();
      expect(resultados.indexOf(directa)).toBe(0);
      for (const r of porLema) {
        expect(r.puntaje).toBeLessThanOrEqual(PESO_LEMA);
        expect(r.puntaje).toBeLessThan(directa.puntaje);
      }
    });

    it('does not bring sibling conjugations: they would take slots without teaching context', () => {
      const servicio = prepararVerbo();
      const resultados = servicio.similares('naijkasheshisha', Idioma.damana, 8);
      const conjugaciones = resultados.filter((r) => r.fuente === 'conjugaciones');
      expect(conjugaciones).toHaveLength(1); // only the direct match
      expect(conjugaciones[0].damana).toBe('naijkasheshisha');
      expect(conjugaciones[0].porLema).toBeUndefined();
    });

    it('without verbs in the query the result does not change', () => {
      const servicio = prepararVerbo();
      const resultados = servicio.similares('nʉnka shkua gontka', Idioma.damana, 8);
      expect(resultados.every((r) => r.porLema === undefined)).toBe(true);
    });

    it('does not expand in the Spanish direction (lemmas are for Damana forms)', () => {
      const servicio = prepararVerbo();
      const resultados = servicio.similares('leer este texto', Idioma.espanol, 8);
      expect(resultados.every((r) => r.porLema === undefined)).toBe(true);
    });
  });

  it('excludes untranslated pairs (biblical references) from the index', () => {
    const referencia = 'Genesis 1:27-31; Salmo 115:16.';
    db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
       VALUES ('ref1', ?, ?, 'aprobado', 'lfb')`,
    ).run(referencia, referencia);
    // Legitimate sentence that shares vocabulary with the query, to
    // check that the filter does not wipe out the good ones.
    db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
       VALUES ('ok1', 'Salmo nʉnka gontka', 'el Salmo dice', 'aprobado', 'lfb')`,
    ).run();
    const servicioNuevo = new RetrievalService(new CorpusRepository(db));

    const resultados = servicioNuevo.similares('Genesis Salmo', Idioma.damana, 8);
    expect(resultados.some((r) => r.damana === referencia)).toBe(false);
    expect(resultados.some((r) => r.damana === 'Salmo nʉnka gontka')).toBe(true);
  });
});
