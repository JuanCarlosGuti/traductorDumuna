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

  it('lista palabras del corpus que no están en el glosario, por frecuencia', () => {
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

  it('excluye lo que ya está en el glosario, stopwords y ruido de teclado', () => {
    insertarOracion('x', 'el agua de la zzzz montaña');
    const palabras = servicio.calcular(HOY).map((f) => f.espanol);
    expect(palabras).toContain('montaña');
    expect(palabras).not.toContain('agua'); // ya en el glosario
    expect(palabras).not.toContain('el'); // stopword
    expect(palabras).not.toContain('zzzz'); // sin vocales
  });

  it('excluye probables nombres propios (solo con mayúscula inicial)', () => {
    insertarOracion('a', 'Jesús llegó');
    insertarOracion('b', 'Jesús habló');
    const palabras = servicio.calcular(HOY).map((f) => f.espanol);
    expect(palabras).not.toContain('jesús');
    expect(palabras).toContain('llegó');
  });

  it('excluye palabras que se escriben igual en damana (caso con ʉ)', () => {
    // 'nʉnka' está en el glosario damana y también aparece como token damana
    db.prepare(
      `INSERT INTO tokens_damana (palabra_normalizada, palabra_original, tabla_origen, id_origen, posicion)
       VALUES ('ciudad', 'ciudad', 'oraciones', 1, 0)`,
    ).run();
    insertarOracion('ciudad guma', 'ciudad grande');
    const palabras = servicio.calcular(HOY).map((f) => f.espanol);
    expect(palabras).not.toContain('ciudad'); // se escribe igual en damana
    expect(palabras).toContain('grande');
  });

  it('ignora las oraciones marcadas «revisar» (alineación dudosa)', () => {
    insertarOracion('a', 'fiable', 'aprobado');
    insertarOracion('b', 'dudosa', 'revisar');
    const palabras = servicio.calcular(HOY).map((f) => f.espanol);
    expect(palabras).toContain('fiable');
    expect(palabras).not.toContain('dudosa');
  });

  it('prioriza las palabras de traducciones con poco apoyo sobre las del corpus', () => {
    insertarOracion('x', 'pueblo pueblo pueblo pueblo pueblo'); // muy frecuente
    // Traducción sin ningún ejemplo → nivel revisar
    insertarTraduccion('quiero sanar', 'x', 'espanol_a_damana', 0, null, 0);
    const filas = servicio.calcular(HOY);
    expect(filas[0].prioridad).toBe(1);
    expect(['quiero', 'sanar']).toContain(filas[0].espanol);
    expect(filas[0].motivo).toBe('traduccion_con_poco_apoyo');
    // 'pueblo' sigue ahí, pero después
    expect(filas.find((f) => f.espanol === 'pueblo')?.prioridad).toBe(2);
  });

  it('NO prioriza traducciones que sí tuvieron buen apoyo', () => {
    insertarTraduccion('sanar', 'x', 'espanol_a_damana', 0.55, 'oraciones', 8);
    expect(servicio.calcular(HOY)).toEqual([]);
  });

  it('cuenta las veces que se pidió una palabra en traducciones distintas', () => {
    insertarTraduccion('sanar rápido', 'x', 'espanol_a_damana', 0, null, 0);
    insertarTraduccion('sanar pronto', 'y', 'espanol_a_damana', 0, null, 0);
    const sanar = servicio.calcular(HOY).find((f) => f.espanol === 'sanar');
    expect(sanar?.vecesVisto).toBe(2);
  });

  it('respeta el tope de filas', () => {
    insertarOracion('x', 'una dos tres cuatro cinco seis siete ocho nueve');
    expect(servicio.calcular(HOY, 3)).toHaveLength(3);
  });

  it('acompaña cada palabra con una oración de ejemplo en ambos idiomas', () => {
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
    token('nʉnka', 'nʉnka', 5); // ya está en el glosario
    token('jehovaga', 'Jehovága', 4); // siempre en mayúscula
    token('zhaguasheka', 'zhaguasheka', 2); // ya tiene glosa en conjugaciones
    const repo = new CorpusRepository(db);
    servicio = new NecesitoService(repo, new TraduccionesRepository(db));
  });

  afterEach(() => db.close());

  it('propone las palabras damana sin traducción, por frecuencia', () => {
    const filas = servicio.calcularDamana();
    expect(filas.map((f) => f.damana)).toEqual(['gontka']);
    expect(filas[0]).toMatchObject({
      damana: 'gontka',
      espanol: '', // la columna que llena el hablante
      vecesVisto: 3,
      ejemploDamana: 'gontka nʉnka Jehovága zhaguasheka',
      ejemploEspanol: 'hizo el agua',
    });
  });

  it('excluye lo que ya está en el glosario (caso con ʉ), las conjugaciones y los nombres propios', () => {
    const palabras = servicio.calcularDamana().map((f) => f.damana);
    expect(palabras).not.toContain('nʉnka'); // en el glosario
    expect(palabras).not.toContain('zhaguasheka'); // ya tiene glosa
    expect(palabras).not.toContain('jehovaga'); // nombre propio
  });

  it('respeta el tope de filas', () => {
    token('otra', 'otra', 1);
    expect(servicio.calcularDamana(1)).toHaveLength(1);
  });
});
