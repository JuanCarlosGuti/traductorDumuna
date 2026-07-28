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
  it('detecta referencias bíblicas (damana idéntico al español)', () => {
    const ref = 'Génesis 1:27-31; Salmo 115:16.';
    expect(esParSinTraduccion(ref, ref)).toBe(true);
  });

  it('detecta nombres propios sueltos y tolera espacios y tildes', () => {
    expect(esParSinTraduccion(' Felipe ', 'Felipe')).toBe(true);
    expect(esParSinTraduccion('Simon', 'Simón')).toBe(true); // normalizar quita tildes
  });

  it('NO marca pares traducidos de verdad (caso con ʉ y ñ)', () => {
    expect(esParSinTraduccion('nʉnka ñingui', 'es otra vez')).toBe(false);
  });

  it('NO marca un par vacío como sin traducción', () => {
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
    // Mismo texto damana con estados distintos → test del peso
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

  it('recupera oraciones por damana con ʉ intacta y puntajes descendentes', () => {
    const resultados = servicio.similares('nʉnka shkua', Idioma.damana, 8);
    expect(resultados.length).toBeGreaterThanOrEqual(2);
    for (const r of resultados) {
      expect(r.damana).toContain('nʉnka');
    }
    const puntajes = resultados.map((r) => r.puntaje);
    expect([...puntajes].sort((a, b) => b - a)).toEqual(puntajes);
  });

  it('una oración estado=revisar puntúa la mitad que la aprobada idéntica y queda después', () => {
    const resultados = servicio.similares('nʉnka shkua gontka', Idioma.damana, 8);
    const aprobada = resultados.find((r) => r.referencia === 'oración 1')!;
    const revisar = resultados.find((r) => r.referencia === 'oración 2 (revisar)')!;
    expect(aprobada).toBeDefined();
    expect(revisar).toBeDefined();
    expect(revisar.puntaje).toBeCloseTo(aprobada.puntaje * PESO_REVISAR, 10);
    expect(resultados.indexOf(aprobada)).toBeLessThan(resultados.indexOf(revisar));
  });

  it('el vocabulario NO participa en el retrieval (va aparte en el prompt)', () => {
    const resultados = servicio.similares('nʉnka', Idioma.damana, 8);
    expect(resultados.some((r) => r.fuente === 'vocabulario')).toBe(false);
    expect(resultados.length).toBeGreaterThan(0); // pero sí encuentra oraciones
  });

  it('las conjugaciones sí participan (caso con ʉ en la forma verbal)', () => {
    const resultados = servicio.similares('nujkunʉnanka', Idioma.damana, 8);
    expect(resultados).toHaveLength(1);
    expect(resultados[0].fuente).toBe('conjugaciones');
    expect(resultados[0].referencia).toBe('conjugación 1 (tener)');
    expect(resultados[0].espanol).toBe('yo tuve');
  });

  it('nunca confunde ʉ con u: buscar "nunka" no recupera nada', () => {
    expect(servicio.similares('nunka', Idioma.damana)).toEqual([]);
  });

  it('recupera por español y trae el damana paralelo (caso con ñ en damana)', () => {
    const resultados = servicio.similares('otra vez al monte', Idioma.espanol, 8);
    expect(resultados[0].damana).toBe('ñingui tua ukurra');
  });

  it('respeta el límite k', () => {
    expect(servicio.similares('nʉnka shkua gontka', Idioma.damana, 1)).toHaveLength(1);
  });

  describe('expansión por lema verbal', () => {
    /** Corpus con el verbo «leer» en dos personas distintas. */
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
      ins.run('naijkasheshisha', 'nos lee'); // esta NO aparece en el corpus
      return new RetrievalService(new CorpusRepository(db));
    };

    it('encuentra oraciones con otra conjugación del mismo verbo', () => {
      const servicio = prepararVerbo();
      // 'naijkasheshisha' no está en ninguna oración: antes daba 0 resultados
      const resultados = servicio.similares('naijkasheshisha', Idioma.damana, 8);
      const oraciones = resultados.filter((r) => r.fuente === 'oraciones');
      expect(oraciones.length).toBeGreaterThan(0);
      expect(oraciones.every((r) => r.porLema === 'leer')).toBe(true);
    });

    it('una coincidencia directa gana a un pariente verbal', () => {
      const servicio = prepararVerbo();
      const resultados = servicio.similares('nʉjkasheshisha', Idioma.damana, 8);
      const directa = resultados.find((r) => r.damana.includes('nʉjkasheshisha'))!;
      const porLema = resultados.find((r) => r.damana.includes('mʉjkasheshisha'))!;
      expect(directa.puntaje).toBeGreaterThan(porLema.puntaje);
      expect(directa.porLema).toBeUndefined();
      expect(porLema.porLema).toBe('leer');
    });

    it('el pariente nunca supera a la coincidencia directa de la conjugación', () => {
      const servicio = prepararVerbo();
      const resultados = servicio.similares('naijkasheshisha', Idioma.damana, 8);
      // La propia entrada de conjugaciones coincide de forma directa (1.0);
      // las oraciones llegan por lema y van rebajadas por PESO_LEMA.
      const directa = resultados.find((r) => r.fuente === 'conjugaciones')!;
      const porLema = resultados.filter((r) => r.fuente === 'oraciones');
      expect(directa.porLema).toBeUndefined();
      expect(resultados.indexOf(directa)).toBe(0);
      for (const r of porLema) {
        expect(r.puntaje).toBeLessThanOrEqual(PESO_LEMA);
        expect(r.puntaje).toBeLessThan(directa.puntaje);
      }
    });

    it('no trae conjugaciones hermanas: ocuparían huecos sin enseñar contexto', () => {
      const servicio = prepararVerbo();
      const resultados = servicio.similares('naijkasheshisha', Idioma.damana, 8);
      const conjugaciones = resultados.filter((r) => r.fuente === 'conjugaciones');
      expect(conjugaciones).toHaveLength(1); // solo la coincidencia directa
      expect(conjugaciones[0].damana).toBe('naijkasheshisha');
      expect(conjugaciones[0].porLema).toBeUndefined();
    });

    it('sin verbos en la consulta el resultado no cambia', () => {
      const servicio = prepararVerbo();
      const resultados = servicio.similares('nʉnka shkua gontka', Idioma.damana, 8);
      expect(resultados.every((r) => r.porLema === undefined)).toBe(true);
    });

    it('no expande en dirección español (los lemas son de formas damana)', () => {
      const servicio = prepararVerbo();
      const resultados = servicio.similares('leer este texto', Idioma.espanol, 8);
      expect(resultados.every((r) => r.porLema === undefined)).toBe(true);
    });
  });

  it('excluye del índice los pares sin traducción (referencias bíblicas)', () => {
    const referencia = 'Genesis 1:27-31; Salmo 115:16.';
    db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
       VALUES ('ref1', ?, ?, 'aprobado', 'lfb')`,
    ).run(referencia, referencia);
    // Oración legítima que comparte vocabulario con la consulta, para
    // comprobar que el filtro no se lleva por delante lo bueno.
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
