import Database from 'better-sqlite3';
import { ejecutarMigraciones } from '../database/migraciones';
import { DominioCorpus, FuenteCorpus, Idioma } from './consulta.enums';
import { CorpusRepository } from './corpus.repository';
import {
  CUPO_BIBLICO,
  CUPO_BIBLICO_REDUCIDO,
  CUPO_COTIDIANO,
  CUPO_GRAMATICA,
  esCasiIgual,
  FragmentoRecuperado,
  MAX_EJEMPLOS,
  repartirPorDominio,
  RetrievalService,
} from './retrieval.service';

/** A distinct synthetic word per id: digits are not tokens. */
const palabraDe = (id: number): string =>
  String(id)
    .split('')
    .map((d) => 'abcdefghij'[Number(d)])
    .join('');

const fragmento = (
  id: number,
  dominio: DominioCorpus,
  puntaje: number,
  damana = `${palabraDe(id)} nʉnka`,
  espanol = `frase ${id} agua`,
): FragmentoRecuperado => ({
  fuente: dominio === DominioCorpus.gramatica ? FuenteCorpus.conjugaciones : FuenteCorpus.oraciones,
  dominio,
  id,
  referencia: `oración ${id}`,
  damana,
  espanol,
  peso: 1,
  puntaje,
});

describe('esCasiIgual', () => {
  it('same Damana except capitals/punctuation → almost equal', () => {
    expect(esCasiIgual({ damana: 'Nʉnka shkua.', espanol: 'a' }, { damana: 'nʉnka shkua', espanol: 'b' })).toBe(true);
  });

  it('same Spanish → almost equal even if the Damana changes', () => {
    expect(esCasiIgual({ damana: 'x y', espanol: 'El agua es una' }, { damana: 'z w', espanol: 'el agua es una' })).toBe(true);
  });

  it('almost all Damana words in common (Jaccard ≥ 0.8) → almost equal', () => {
    const a = { damana: 'a b c d e', espanol: 'uno' };
    const b = { damana: 'a b c d e f', espanol: 'dos' };
    expect(esCasiIgual(a, b)).toBe(true);
  });

  it('ʉ ≠ u: «nʉnka shkua» and «nunka shkua» are NOT almost equal', () => {
    expect(esCasiIgual({ damana: 'nʉnka shkua', espanol: 'a' }, { damana: 'nunka shkua', espanol: 'b' })).toBe(false);
  });
});

describe('repartirPorDominio (prompt quotas)', () => {
  it('up to 6 everyday, 4 grammar and, with enough everyday ones, only 2 biblical', () => {
    const candidatos = [
      ...Array.from({ length: 9 }, (_, i) => fragmento(100 + i, DominioCorpus.cotidiano, 0.9 - i * 0.01)),
      ...Array.from({ length: 6 }, (_, i) => fragmento(200 + i, DominioCorpus.gramatica, 0.8 - i * 0.01)),
      ...Array.from({ length: 7 }, (_, i) => fragmento(300 + i, DominioCorpus.biblico, 0.95 - i * 0.01)),
    ];
    const r = repartirPorDominio(candidatos);
    const cuenta = (d: DominioCorpus) => r.filter((f) => f.dominio === d).length;
    expect(cuenta(DominioCorpus.cotidiano)).toBe(CUPO_COTIDIANO);
    expect(cuenta(DominioCorpus.gramatica)).toBe(CUPO_GRAMATICA);
    expect(cuenta(DominioCorpus.biblico)).toBe(CUPO_BIBLICO_REDUCIDO);
    expect(r.length).toBeLessThanOrEqual(MAX_EJEMPLOS);
    // everyday ones go first even if the biblical ones score higher
    expect(r[0].dominio).toBe(DominioCorpus.cotidiano);
    expect(r.at(-1)!.dominio).toBe(DominioCorpus.biblico);
  });

  it('with few everyday ones the biblical ones keep their quota of 4', () => {
    const candidatos = [
      ...Array.from({ length: 3 }, (_, i) => fragmento(100 + i, DominioCorpus.cotidiano, 0.9)),
      ...Array.from({ length: 7 }, (_, i) => fragmento(300 + i, DominioCorpus.biblico, 0.8 - i * 0.01)),
    ];
    const r = repartirPorDominio(candidatos);
    expect(r.filter((f) => f.dominio === DominioCorpus.biblico)).toHaveLength(CUPO_BIBLICO);
    expect(r.filter((f) => f.dominio === DominioCorpus.cotidiano)).toHaveLength(3);
  });

  it('discards near-duplicates keeping the one with the highest score', () => {
    const candidatos = [
      fragmento(1, DominioCorpus.cotidiano, 0.5, 'nʉnka shkua gontka', 'el agua es una'),
      fragmento(2, DominioCorpus.cotidiano, 0.9, 'Nʉnka shkua gontka.', 'El agua es una.'),
      fragmento(3, DominioCorpus.cotidiano, 0.7, 'ñingui tua ukurra', 'otra vez al monte'),
    ];
    const r = repartirPorDominio(candidatos);
    expect(r.map((f) => f.id)).toEqual([2, 3]);
  });

  it('never returns more than 14 examples', () => {
    const candidatos = [
      ...Array.from({ length: 20 }, (_, i) => fragmento(100 + i, DominioCorpus.cotidiano, 0.9 - i * 0.01)),
      ...Array.from({ length: 20 }, (_, i) => fragmento(200 + i, DominioCorpus.gramatica, 0.9 - i * 0.01)),
      ...Array.from({ length: 20 }, (_, i) => fragmento(300 + i, DominioCorpus.biblico, 0.9 - i * 0.01)),
    ];
    expect(repartirPorDominio(candidatos).length).toBeLessThanOrEqual(MAX_EJEMPLOS);
  });
});

describe('RetrievalService.recuperarContexto', () => {
  let db: Database.Database;
  let servicio: RetrievalService;

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    const insOracion = db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente, dominio)
       VALUES (?, ?, ?, 'aprobado', ?, ?)`,
    );
    insOracion.run('b1', 'Jehová nʉnka gontka kʉñingui', 'Jehová hizo el agua del cielo', 'lfb', 'biblico');
    insOracion.run('b2', 'Jehová nʉnka ingui gontka', 'Jehová hizo el agua otra vez', 'lfb', 'biblico');
    insOracion.run('c1', 'Abu nʉnka dugwa urragamba', 'mamá cocina el agua en la casa', 'elicitacion', 'cotidiano');
    insOracion.run('c2', 'Abu urragamba nuka', 'mamá está en la casa', 'elicitacion', 'cotidiano');
    db.prepare(
      `INSERT INTO conjugaciones (damana, espanol, lema, fuente, notas) VALUES ('nʉnka dugwa', 'cocina el agua', 'cocinar', 'doc', NULL)`,
    ).run();
    const insVocab = db.prepare(
      `INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente) VALUES (?, ?, ?, NULL, 'dic')`,
    );
    insVocab.run('mamá', 'Abu', 'Personas y familia');
    insVocab.run('Casa', 'Urraga', 'Casa / objetos / herramientas');
    insVocab.run('Cocinar', 'Dugua', 'Verbos');
    insVocab.run('Agua', 'nʉnka', 'Naturaleza / geografía');
    const insRegla = db.prepare(
      `INSERT INTO reglas (tipo, forma, significado, ejemplo_base, ejemplo_regla, traduccion_ejemplo, notas, disparador)
       VALUES ('sufijo', ?, ?, ?, ?, ?, NULL, ?)`,
    );
    insRegla.run('-ndzina', 'pluraliza sustantivos', 'terrua (hombre)', 'terruandzina', 'hombres', 'plural');
    insRegla.run('-nzhe', 'posesivo / "de"', 'Kunkujshina (Dios)', 'Kunkujshinanzhe', 'de Dios', 'posesivo');
    db.prepare(
      `INSERT INTO nombres_propios (damana, espanol, se_escribe_igual, otras_grafias, notas)
       VALUES ('Jehová', 'Jehová', 1, 'Jehova', NULL)`,
    ).run();
    servicio = new RetrievalService(new CorpusRepository(db));
  });

  afterEach(() => db.close());

  it('Spanish → Damana: per-word dictionary, possessive feature, -nzhe rule and examples by domain', () => {
    const c = servicio.recuperarContexto('mi mamá cocina en la casa', Idioma.espanol);
    expect(c.diccionario.find((a) => a.palabra === 'mamá')).toMatchObject({ damana: 'Abu', coincidencia: 'exacta' });
    expect(c.diccionario.find((a) => a.palabra === 'casa')).toMatchObject({ damana: 'Urraga' });
    expect(c.diccionario.find((a) => a.palabra === 'cocina')).toMatchObject({ damana: 'Dugua', coincidencia: 'posible' });
    expect(c.disparadores).toEqual(['posesivo']);
    expect(c.reglas.map((r) => r.forma)).toEqual(['-nzhe']);
    expect(c.nombresPropios).toEqual([]);
    const dominios = c.ejemplos.map((e) => e.dominio);
    expect(dominios).toContain(DominioCorpus.cotidiano);
    // everyday ones go before the biblical ones
    expect(dominios.indexOf(DominioCorpus.cotidiano)).toBeLessThan(
      dominios.includes(DominioCorpus.biblico) ? dominios.indexOf(DominioCorpus.biblico) : Infinity,
    );
  });

  it('recognizes the proper name under any of its spellings and returns the corpus one', () => {
    const c = servicio.recuperarContexto('Jehova hizo el agua', Idioma.espanol);
    expect(c.nombresPropios).toEqual([{ enTexto: 'Jehova', espanol: 'Jehová', damana: 'Jehová' }]);
  });

  it('Damana → Spanish: the rule is triggered by suffix (terruandzina → -ndzina) and the dictionary by token with ʉ', () => {
    const c = servicio.recuperarContexto('terruandzina nʉnka', Idioma.damana);
    expect(c.reglas.map((r) => r.forma)).toEqual(['-ndzina']);
    expect(c.disparadores).toEqual(['plural']);
    expect(c.diccionario.find((a) => a.palabra === 'nʉnka')).toMatchObject({ espanol: 'Agua', coincidencia: 'exacta' });
    expect(c.ejemplos.some((e) => e.dominio === DominioCorpus.gramatica)).toBe(true);
  });

  it('never confuses ʉ with u: «nunka» finds neither dictionary nor examples', () => {
    const c = servicio.recuperarContexto('nunka', Idioma.damana);
    expect(c.diccionario).toEqual([]);
    expect(c.ejemplos).toEqual([]);
  });
});
