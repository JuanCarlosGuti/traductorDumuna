import Database from 'better-sqlite3';
import { CorpusRepository } from '../consulta/corpus.repository';
import { ejecutarMigraciones } from '../database/migraciones';
import { TraduccionesRepository } from '../traduccion/traducciones.repository';
import { NecesitoService } from './necesito.service';

const HOY = '2026-07-28';

describe('NecesitoService', () => {
  let db: Database.Database;
  let servicio: NecesitoService;

  const insertarOracion = (damana: string, espanol: string, estado = 'aprobado') =>
    db
      .prepare(
        `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
         VALUES ('x', ?, ?, ?, 'lfb')`,
      )
      .run(damana, espanol, estado);

  const insertarTraduccion = (
    texto: string,
    traduccion: string,
    direccion: string,
    puntajeMedio: number,
    fuenteTop: string | null,
    ejemplos: number,
  ) =>
    db
      .prepare(
        `INSERT INTO traducciones
           (creado_en, texto, traduccion, direccion, puntaje_top, puntaje_medio,
            fuente_top, ejemplos_recuperados, palabras_dudosas, vocabulario_usado, modelo)
         VALUES ('2026-07-28T10:00:00.000Z', ?, ?, ?, 0.5, ?, ?, ?, '[]', '[]', 'm')`,
      )
      .run(texto, traduccion, direccion, puntajeMedio, fuenteTop, ejemplos);

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    db.prepare(
      `INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente)
       VALUES ('agua', 'nʉnka', NULL, NULL, 'dic')`,
    ).run();
    const repo = new CorpusRepository(db);
    servicio = new NecesitoService(repo, new TraduccionesRepository(db));
  });

  afterEach(() => db.close());

  it('lists corpus words that are not in the glossary, by frequency', () => {
    insertarOracion('a b c', 'pueblo pueblo montaña');
    insertarOracion('d e', 'pueblo casa');
    const filas = servicio.calcular(HOY);
    expect(filas.map((f) => f.espanol)).toEqual(['pueblo', 'casa', 'montaña']);
    expect(filas[0]).toMatchObject({
      espanol: 'pueblo',
      damana: '',
      motivo: 'en_corpus_sin_glosario',
      prioridad: 2,
      vecesVisto: 3,
      fecha: HOY,
    });
  });

  it('excludes what is already in the glossary, stopwords and keyboard noise', () => {
    insertarOracion('x', 'el agua de la zzzz montaña');
    const palabras = servicio.calcular(HOY).map((f) => f.espanol);
    expect(palabras).toContain('montaña');
    expect(palabras).not.toContain('agua'); // already in the glossary
    expect(palabras).not.toContain('el'); // stopword
    expect(palabras).not.toContain('zzzz'); // no vowels
  });

  it('excludes probable proper names (initial capital only)', () => {
    insertarOracion('a', 'Jesús llegó');
    insertarOracion('b', 'Jesús habló');
    const palabras = servicio.calcular(HOY).map((f) => f.espanol);
    expect(palabras).not.toContain('jesús');
    expect(palabras).toContain('llegó');
  });

  it('excludes words that are written the same in Damana (case with ʉ)', () => {
    // 'nʉnka' is in the Damana glossary and also appears as a Damana token
    db.prepare(
      `INSERT INTO tokens_damana (palabra_normalizada, palabra_original, tabla_origen, id_origen, posicion)
       VALUES ('ciudad', 'ciudad', 'oraciones', 1, 0)`,
    ).run();
    insertarOracion('ciudad guma', 'ciudad grande');
    const palabras = servicio.calcular(HOY).map((f) => f.espanol);
    expect(palabras).not.toContain('ciudad'); // written the same in Damana
    expect(palabras).toContain('grande');
  });

  it('ignores sentences marked «revisar» (doubtful alignment)', () => {
    insertarOracion('a', 'fiable', 'aprobado');
    insertarOracion('b', 'dudosa', 'revisar');
    const palabras = servicio.calcular(HOY).map((f) => f.espanol);
    expect(palabras).toContain('fiable');
    expect(palabras).not.toContain('dudosa');
  });

  it('prioritizes words from poorly supported translations over corpus ones', () => {
    insertarOracion('x', 'pueblo pueblo pueblo pueblo pueblo'); // very frequent
    // Translation with no example at all → revisar level
    insertarTraduccion('quiero sanar', 'x', 'espanol_a_damana', 0, null, 0);
    const filas = servicio.calcular(HOY);
    expect(filas[0].prioridad).toBe(1);
    expect(['quiero', 'sanar']).toContain(filas[0].espanol);
    expect(filas[0].motivo).toBe('traduccion_con_poco_apoyo');
    // 'pueblo' is still there, but later
    expect(filas.find((f) => f.espanol === 'pueblo')?.prioridad).toBe(2);
  });

  it('does NOT prioritize translations that did have good support', () => {
    insertarTraduccion('sanar', 'x', 'espanol_a_damana', 0.55, 'oraciones', 8);
    expect(servicio.calcular(HOY)).toEqual([]);
  });

  it('counts the times a word was requested in different translations', () => {
    insertarTraduccion('sanar rápido', 'x', 'espanol_a_damana', 0, null, 0);
    insertarTraduccion('sanar pronto', 'y', 'espanol_a_damana', 0, null, 0);
    const sanar = servicio.calcular(HOY).find((f) => f.espanol === 'sanar');
    expect(sanar?.vecesVisto).toBe(2);
  });

  it('respects the row cap', () => {
    insertarOracion('x', 'una dos tres cuatro cinco seis siete ocho nueve');
    expect(servicio.calcular(HOY, 3)).toHaveLength(3);
  });

  it('accompanies each word with an example sentence in both languages', () => {
    insertarOracion('nʉnka gontka shkua', 'el agua hizo montaña');
    const fila = servicio.calcular(HOY).find((f) => f.espanol === 'montaña');
    expect(fila?.ejemploEspanol).toBe('el agua hizo montaña');
    expect(fila?.ejemploDamana).toBe('nʉnka gontka shkua');
  });
});

describe('NecesitoService.calcularDamana', () => {
  let db: Database.Database;
  let servicio: NecesitoService;

  const token = (palabra: string, original: string, veces = 1) => {
    for (let i = 0; i < veces; i++) {
      db.prepare(
        `INSERT INTO tokens_damana (palabra_normalizada, palabra_original, tabla_origen, id_origen, posicion)
         VALUES (?, ?, 'oraciones', 1, ?)`,
      ).run(palabra, original, i);
    }
  };

  beforeEach(() => {
    db = new Database(':memory:');
    ejecutarMigraciones(db);
    db.prepare(
      `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
       VALUES ('o1', 'gontka nʉnka Jehovága zhaguasheka', 'hizo el agua', 'aprobado', 'lfb')`,
    ).run();
    db.prepare(
      `INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente)
       VALUES ('agua', 'nʉnka', NULL, NULL, 'dic')`,
    ).run();
    db.prepare(
      `INSERT INTO conjugaciones (damana, espanol, lema, fuente, notas)
       VALUES ('zhaguasheka', 'él acechó', 'acechar', 'doc', NULL)`,
    ).run();
    token('gontka', 'gontka', 3);
    token('nʉnka', 'nʉnka', 5); // already in the glossary
    token('jehovaga', 'Jehovága', 4); // always capitalized
    token('zhaguasheka', 'zhaguasheka', 2); // already has a gloss in conjugaciones
    const repo = new CorpusRepository(db);
    servicio = new NecesitoService(repo, new TraduccionesRepository(db));
  });

  afterEach(() => db.close());

  it('proposes Damana words without a translation, by frequency', () => {
    const filas = servicio.calcularDamana();
    expect(filas.map((f) => f.damana)).toEqual(['gontka']);
    expect(filas[0]).toMatchObject({
      damana: 'gontka',
      espanol: '', // the column the speaker fills in
      vecesVisto: 3,
      ejemploDamana: 'gontka nʉnka Jehovága zhaguasheka',
      ejemploEspanol: 'hizo el agua',
    });
  });

  it('excludes what is already in the glossary (case with ʉ), conjugations and proper names', () => {
    const palabras = servicio.calcularDamana().map((f) => f.damana);
    expect(palabras).not.toContain('nʉnka'); // in the glossary
    expect(palabras).not.toContain('zhaguasheka'); // already has a gloss
    expect(palabras).not.toContain('jehovaga'); // proper name
  });

  it('respects the row cap', () => {
    token('otra', 'otra', 1);
    expect(servicio.calcularDamana(1)).toHaveLength(1);
  });
});
