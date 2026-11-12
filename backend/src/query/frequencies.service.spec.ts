import Database from 'better-sqlite3';
import { runMigrations } from '../database/migrations';
import { CorpusRepository } from './corpus.repository';
import { FrequenciesService } from './frequencies.service';

describe('FrequenciesService', () => {
  let db: Database.Database;
  let service: FrequenciesService;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    // Vocabulary entry with a category for kʉnʉnka
    db.prepare(
      `INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente)
       VALUES ('tiene', 'kʉnʉnka', 'Verbos', NULL, 'diccionario wiwa')`,
    ).run();
    const ins = db.prepare(
      `INSERT INTO tokens_damana (palabra_normalizada, palabra_original, tabla_origen, id_origen, posicion)
       VALUES (?, ?, 'frases', 1, ?)`,
    );
    // jehova: ONLY with an initial capital → probably a proper name
    ins.run('jehova', 'Jehová', 0);
    ins.run('jehova', 'Jehová', 1);
    ins.run('jehova', 'Jehová', 2);
    // nʉnka: lowercase (case with ʉ) → kept
    ins.run('nʉnka', 'nʉnka', 3);
    ins.run('nʉnka', 'nʉnka', 4);
    // shkua: appears capitalized at the start of a sentence AND in lowercase → kept
    ins.run('shkua', 'Shkua', 5);
    ins.run('shkua', 'shkua', 6);
    // ñandu: ONLY with capital Ñ (case with ñ) → probably a proper name
    ins.run('ñandu', 'Ñandú', 7);
    // kʉnʉnka: in the vocabulary with category Verbos
    ins.run('kʉnʉnka', 'kʉnʉnka', 8);
    service = new FrequenciesService(new CorpusRepository(db));
  });

  afterEach(() => db.close());

  it('excludes probable proper names (initial capital only)', () => {
    const words = service.listAll(500).map((f) => f.palabra);
    expect(words).not.toContain('jehova');
    expect(words).not.toContain('ñandu'); // capital Ñ counts too
    expect(words).toContain('nʉnka');
    expect(words).toContain('shkua');
  });

  it('sorts by descending frequency', () => {
    const rows = service.listAll(500);
    expect(rows[0]).toEqual({
      palabra: 'nʉnka',
      frecuencia: 2,
      traduccion: null,
      categoria: null,
    });
    expect(rows[1]).toEqual({
      palabra: 'shkua',
      frecuencia: 2,
      traduccion: null,
      categoria: null,
    });
  });

  it('brings translation and category from the vocabulary when the Damana matches (case with ʉ)', () => {
    const row = service.listAll(500).find((f) => f.palabra === 'kʉnʉnka');
    expect(row).toEqual({
      palabra: 'kʉnʉnka',
      frecuencia: 1,
      traduccion: 'tiene',
      categoria: 'Verbos',
    });
  });

  it('uses the conjugation gloss as translation when there is no vocabulary (case with ñ)', () => {
    db.prepare(
      `INSERT INTO conjugaciones (damana, espanol, lema, fuente, notas)
       VALUES ('ñingunka', 'él volvió', 'volver', 'doc', NULL)`,
    ).run();
    db.prepare(
      `INSERT INTO tokens_damana (palabra_normalizada, palabra_original, tabla_origen, id_origen, posicion)
       VALUES ('ñingunka', 'ñingunka', 'conjugaciones', 1, 0)`,
    ).run();
    const row = service.listAll(500).find((f) => f.palabra === 'ñingunka');
    expect(row).toMatchObject({ traduccion: 'él volvió', categoria: null });
  });

  it('respects the limit', () => {
    expect(service.listAll(1)).toHaveLength(1);
  });
});
