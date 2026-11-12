import Database from 'better-sqlite3';
import { ejecutarMigraciones } from '../database/migraciones';
import { CorpusRepository } from './corpus.repository';
import { FrecuenciasService } from './frecuencias.service';

describe('FrecuenciasService', () => {
  let db: Database.Database;
  let servicio: FrecuenciasService;

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
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
    servicio = new FrecuenciasService(new CorpusRepository(db));
  });

  afterEach(() => db.close());

  it('excluye probables nombres propios (solo con mayúscula inicial)', () => {
    const palabras = servicio.listar(500).map((f) => f.palabra);
    expect(palabras).not.toContain('jehova');
    expect(palabras).not.toContain('ñandu'); // capital Ñ counts too
    expect(palabras).toContain('nʉnka');
    expect(palabras).toContain('shkua');
  });

  it('ordena por frecuencia descendente', () => {
    const filas = servicio.listar(500);
    expect(filas[0]).toEqual({
      palabra: 'nʉnka',
      frecuencia: 2,
      traduccion: null,
      categoria: null,
    });
    expect(filas[1]).toEqual({
      palabra: 'shkua',
      frecuencia: 2,
      traduccion: null,
      categoria: null,
    });
  });

  it('trae traducción y categoría del vocabulario cuando el damana coincide (caso con ʉ)', () => {
    const fila = servicio.listar(500).find((f) => f.palabra === 'kʉnʉnka');
    expect(fila).toEqual({
      palabra: 'kʉnʉnka',
      frecuencia: 1,
      traduccion: 'tiene',
      categoria: 'Verbos',
    });
  });

  it('usa la glosa de conjugación como traducción cuando no hay vocabulario (caso con ñ)', () => {
    db.prepare(
      `INSERT INTO conjugaciones (damana, espanol, lema, fuente, notas)
       VALUES ('ñingunka', 'él volvió', 'volver', 'doc', NULL)`,
    ).run();
    db.prepare(
      `INSERT INTO tokens_damana (palabra_normalizada, palabra_original, tabla_origen, id_origen, posicion)
       VALUES ('ñingunka', 'ñingunka', 'conjugaciones', 1, 0)`,
    ).run();
    const fila = servicio.listar(500).find((f) => f.palabra === 'ñingunka');
    expect(fila).toMatchObject({ traduccion: 'él volvió', categoria: null });
  });

  it('respeta el límite', () => {
    expect(servicio.listar(1)).toHaveLength(1);
  });
});
