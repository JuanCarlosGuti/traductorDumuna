import Database from 'better-sqlite3';
import { runMigrations } from '../database/migrations';
import { CorpusDomain, CorpusSource, Language } from './query.enums';
import { CorpusRepository } from './corpus.repository';
import {
  BIBLICAL_QUOTA,
  REDUCED_BIBLICAL_QUOTA,
  EVERYDAY_QUOTA,
  GRAMMAR_QUOTA,
  isAlmostEqual,
  RetrievedFragment,
  MAX_EXAMPLES,
  splitByDomain,
  RetrievalService,
} from './retrieval.service';

/** A distinct synthetic word per id: digits are not tokens. */
const wordOf = (id: number): string =>
  String(id)
    .split('')
    .map((d) => 'abcdefghij'[Number(d)])
    .join('');

const fragment = (
  id: number,
  domain: CorpusDomain,
  score: number,
  damana = `${wordOf(id)} nʉnka`,
  spanish = `frase ${id} agua`,
): RetrievedFragment => ({
  source: domain === CorpusDomain.gramatica ? CorpusSource.conjugaciones : CorpusSource.oraciones,
  domain: domain,
  id,
  reference: `oración ${id}`,
  damana,
  spanish: spanish,
  weight: 1,
  score: score,
});

describe('isAlmostEqual', () => {
  it('same Damana except capitals/punctuation → almost equal', () => {
    expect(isAlmostEqual({ damana: 'Nʉnka shkua.', spanish: 'a' }, { damana: 'nʉnka shkua', spanish: 'b' })).toBe(true);
  });

  it('same Spanish → almost equal even if the Damana changes', () => {
    expect(isAlmostEqual({ damana: 'x y', spanish: 'El agua es una' }, { damana: 'z w', spanish: 'el agua es una' })).toBe(true);
  });

  it('almost all Damana words in common (Jaccard ≥ 0.8) → almost equal', () => {
    const a = { damana: 'a b c d e', spanish: 'uno' };
    const b = { damana: 'a b c d e f', spanish: 'dos' };
    expect(isAlmostEqual(a, b)).toBe(true);
  });

  it('ʉ ≠ u: «nʉnka shkua» and «nunka shkua» are NOT almost equal', () => {
    expect(isAlmostEqual({ damana: 'nʉnka shkua', spanish: 'a' }, { damana: 'nunka shkua', spanish: 'b' })).toBe(false);
  });
});

describe('splitByDomain (prompt quotas)', () => {
  it('up to 6 everyday, 4 grammar and, with enough everyday ones, only 2 biblical', () => {
    const candidates = [
      ...Array.from({ length: 9 }, (_, i) => fragment(100 + i, CorpusDomain.cotidiano, 0.9 - i * 0.01)),
      ...Array.from({ length: 6 }, (_, i) => fragment(200 + i, CorpusDomain.gramatica, 0.8 - i * 0.01)),
      ...Array.from({ length: 7 }, (_, i) => fragment(300 + i, CorpusDomain.biblico, 0.95 - i * 0.01)),
    ];
    const r = splitByDomain(candidates);
    const counter = (d: CorpusDomain) => r.filter((f) => f.domain === d).length;
    expect(counter(CorpusDomain.cotidiano)).toBe(EVERYDAY_QUOTA);
    expect(counter(CorpusDomain.gramatica)).toBe(GRAMMAR_QUOTA);
    expect(counter(CorpusDomain.biblico)).toBe(REDUCED_BIBLICAL_QUOTA);
    expect(r.length).toBeLessThanOrEqual(MAX_EXAMPLES);
    // everyday ones go first even if the biblical ones score higher
    expect(r[0].domain).toBe(CorpusDomain.cotidiano);
    expect(r.at(-1)!.domain).toBe(CorpusDomain.biblico);
  });

  it('with few everyday ones the biblical ones keep their quota of 4', () => {
    const candidates = [
      ...Array.from({ length: 3 }, (_, i) => fragment(100 + i, CorpusDomain.cotidiano, 0.9)),
      ...Array.from({ length: 7 }, (_, i) => fragment(300 + i, CorpusDomain.biblico, 0.8 - i * 0.01)),
    ];
    const r = splitByDomain(candidates);
    expect(r.filter((f) => f.domain === CorpusDomain.biblico)).toHaveLength(BIBLICAL_QUOTA);
    expect(r.filter((f) => f.domain === CorpusDomain.cotidiano)).toHaveLength(3);
  });

  it('discards near-duplicates keeping the one with the highest score', () => {
    const candidates = [
      fragment(1, CorpusDomain.cotidiano, 0.5, 'nʉnka shkua gontka', 'el agua es una'),
      fragment(2, CorpusDomain.cotidiano, 0.9, 'Nʉnka shkua gontka.', 'El agua es una.'),
      fragment(3, CorpusDomain.cotidiano, 0.7, 'ñingui tua ukurra', 'otra vez al monte'),
    ];
    const r = splitByDomain(candidates);
    expect(r.map((f) => f.id)).toEqual([2, 3]);
  });

  it('never returns more than 14 examples', () => {
    const candidates = [
      ...Array.from({ length: 20 }, (_, i) => fragment(100 + i, CorpusDomain.cotidiano, 0.9 - i * 0.01)),
      ...Array.from({ length: 20 }, (_, i) => fragment(200 + i, CorpusDomain.gramatica, 0.9 - i * 0.01)),
      ...Array.from({ length: 20 }, (_, i) => fragment(300 + i, CorpusDomain.biblico, 0.9 - i * 0.01)),
    ];
    expect(splitByDomain(candidates).length).toBeLessThanOrEqual(MAX_EXAMPLES);
  });
});

describe('RetrievalService.recuperarContexto', () => {
  let db: Database.Database;
  let service: RetrievalService;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    const insSentence = db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente, dominio)
       VALUES (?, ?, ?, 'aprobado', ?, ?)`,
    );
    insSentence.run('b1', 'Jehová nʉnka gontka kʉñingui', 'Jehová hizo el agua del cielo', 'lfb', 'biblico');
    insSentence.run('b2', 'Jehová nʉnka ingui gontka', 'Jehová hizo el agua otra vez', 'lfb', 'biblico');
    insSentence.run('c1', 'Abu nʉnka dugwa urragamba', 'mamá cocina el agua en la casa', 'elicitacion', 'cotidiano');
    insSentence.run('c2', 'Abu urragamba nuka', 'mamá está en la casa', 'elicitacion', 'cotidiano');
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
    const insRule = db.prepare(
      `INSERT INTO reglas (tipo, forma, significado, ejemplo_base, ejemplo_regla, traduccion_ejemplo, notas, disparador)
       VALUES ('sufijo', ?, ?, ?, ?, ?, NULL, ?)`,
    );
    insRule.run('-ndzina', 'pluraliza sustantivos', 'terrua (hombre)', 'terruandzina', 'hombres', 'plural');
    insRule.run('-nzhe', 'posesivo / "de"', 'Kunkujshina (Dios)', 'Kunkujshinanzhe', 'de Dios', 'posesivo');
    db.prepare(
      `INSERT INTO nombres_propios (damana, espanol, se_escribe_igual, otras_grafias, notas)
       VALUES ('Jehová', 'Jehová', 1, 'Jehova', NULL)`,
    ).run();
    service = new RetrievalService(new CorpusRepository(db));
  });

  afterEach(() => db.close());

  it('Spanish → Damana: per-word dictionary, possessive feature, -nzhe rule and examples by domain', () => {
    const c = service.retrieveContext('mi mamá cocina en la casa', Language.espanol);
    expect(c.dictionary.find((a) => a.word === 'mamá')).toMatchObject({ damana: 'Abu', match: 'exacta' });
    expect(c.dictionary.find((a) => a.word === 'casa')).toMatchObject({ damana: 'Urraga' });
    expect(c.dictionary.find((a) => a.word === 'cocina')).toMatchObject({ damana: 'Dugua', match: 'posible' });
    expect(c.triggers).toEqual(['posesivo']);
    expect(c.rules.map((r) => r.form)).toEqual(['-nzhe']);
    expect(c.properNames).toEqual([]);
    const domains = c.examples.map((e) => e.domain);
    expect(domains).toContain(CorpusDomain.cotidiano);
    // everyday ones go before the biblical ones
    expect(domains.indexOf(CorpusDomain.cotidiano)).toBeLessThan(
      domains.includes(CorpusDomain.biblico) ? domains.indexOf(CorpusDomain.biblico) : Infinity,
    );
  });

  it('recognizes the proper name under any of its spellings and returns the corpus one', () => {
    const c = service.retrieveContext('Jehova hizo el agua', Language.espanol);
    expect(c.properNames).toEqual([{ inText: 'Jehova', spanish: 'Jehová', damana: 'Jehová' }]);
  });

  it('Damana → Spanish: the rule is triggered by suffix (terruandzina → -ndzina) and the dictionary by token with ʉ', () => {
    const c = service.retrieveContext('terruandzina nʉnka', Language.damana);
    expect(c.rules.map((r) => r.form)).toEqual(['-ndzina']);
    expect(c.triggers).toEqual(['plural']);
    expect(c.dictionary.find((a) => a.word === 'nʉnka')).toMatchObject({ spanish: 'Agua', match: 'exacta' });
    expect(c.examples.some((e) => e.domain === CorpusDomain.gramatica)).toBe(true);
  });

  it('never confuses ʉ with u: «nunka» finds neither dictionary nor examples', () => {
    const c = service.retrieveContext('nunka', Language.damana);
    expect(c.dictionary).toEqual([]);
    expect(c.examples).toEqual([]);
  });
});
