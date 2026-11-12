import Database from 'better-sqlite3';
import { ejecutarMigraciones } from './migraciones';

const VERSION_ACTUAL = 7;

/**
 * Leaves a freshly migrated database as if it had stayed at an earlier
 * version: removes what later versions added and rolls back
 * user_version. This tests that migrations run over real data.
 */
function retrocederA(db: Database.Database, version: 4 | 5 | 6): void {
  db.exec(`
    ALTER TABLE traducciones DROP COLUMN tokens_entrada;
    ALTER TABLE traducciones DROP COLUMN tokens_salida;
    ALTER TABLE traducciones DROP COLUMN tokens_cache_leidos;
    ALTER TABLE traducciones DROP COLUMN tokens_cache_creados;
    ALTER TABLE traducciones DROP COLUMN duracion_ms;
  `);
  if (version <= 5) {
    db.exec(`
      DROP TABLE reglas; DROP TABLE nombres_propios; DROP TABLE pendientes; DROP TABLE validadas;
      ALTER TABLE oraciones DROP COLUMN dominio;
      ALTER TABLE frases DROP COLUMN dominio;
      ALTER TABLE traducciones DROP COLUMN confianza;
      ALTER TABLE traducciones DROP COLUMN reglas_aplicadas;
      ALTER TABLE traducciones DROP COLUMN glosa;
    `);
  }
  if (version === 4) {
    db.exec('ALTER TABLE traducciones DROP COLUMN ejemplos_en_contexto');
  }
  db.pragma(`user_version = ${version}`);
}

describe('ejecutarMigraciones', () => {
  it('creates the corpus tables (v3 + v6) and the indexes', () => {
    const db = new Database(':memory:');
    ejecutarMigraciones(db);

    const tablas = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((f: any) => f.name);
    expect(tablas).toEqual([
      'conjugaciones',
      'frases',
      'nombres_propios',
      'oraciones',
      'pendientes',
      'progreso_srs',
      'reglas',
      'tokens_damana',
      'traducciones',
      'validadas',
      'vocabulario',
    ]);

    const indices = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all()
      .map((f: any) => f.name);
    expect(indices).toContain('idx_tokens_palabra');
    expect(indices).toContain('idx_conjugaciones_lema');
    db.close();
  });

  it('is idempotent: running it twice neither fails nor duplicates', () => {
    const db = new Database(':memory:');
    ejecutarMigraciones(db);
    expect(() => ejecutarMigraciones(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(VERSION_ACTUAL);
    db.close();
  });

  it('v5 adds ejemplos_en_contexto and leaves already logged rows as null (database stopped at v4)', () => {
    const db = new Database(':memory:');
    ejecutarMigraciones(db);
    retrocederA(db, 4);
    db.prepare(
      `INSERT INTO traducciones
         (creado_en, texto, traduccion, direccion, puntaje_top, puntaje_medio,
          fuente_top, ejemplos_recuperados, palabras_dudosas, vocabulario_usado, modelo)
       VALUES ('2026-07-01T00:00:00.000Z', 'nʉjkasheshisha ñingui', 'me lee otra vez',
               'damana_a_espanol', 0.9, 0.4, 'conjugaciones', 3, '[]', '[]', 'groq')`,
    ).run();

    ejecutarMigraciones(db);

    expect(db.pragma('user_version', { simple: true })).toBe(VERSION_ACTUAL);
    const fila = db
      .prepare('SELECT texto, ejemplos_en_contexto, confianza FROM traducciones')
      .get() as { texto: string; ejemplos_en_contexto: number | null; confianza: number | null };
    expect(fila.texto).toBe('nʉjkasheshisha ñingui'); // ʉ and ñ intact
    expect(fila.ejemplos_en_contexto).toBeNull();
    expect(fila.confianza).toBeNull();
    db.close();
  });

  it('v6 adds dominio with a default value to existing rows (database stopped at v5)', () => {
    const db = new Database(':memory:');
    ejecutarMigraciones(db);
    retrocederA(db, 5);
    db.prepare(
      "INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente) VALUES ('o1', 'nʉnka', 'agua', 'aprobado', 'lfb')",
    ).run();
    db.prepare(
      "INSERT INTO frases (fuente, damana, espanol, notas) VALUES ('Prueba', 'ñingui', 'otra vez', NULL)",
    ).run();

    ejecutarMigraciones(db);

    expect(db.pragma('user_version', { simple: true })).toBe(VERSION_ACTUAL);
    expect(db.prepare('SELECT dominio FROM oraciones').get()).toEqual({ dominio: 'biblico' });
    expect(db.prepare('SELECT dominio FROM frases').get()).toEqual({ dominio: 'cotidiano' });
    expect(() =>
      db
        .prepare(
          "INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente, dominio) VALUES ('o2', 'x', 'y', 'aprobado', 'p', 'poesia')",
        )
        .run(),
    ).toThrow();
    db.close();
  });

  it('v7 adds the usage columns and leaves already logged rows as null (database stopped at v6)', () => {
    const db = new Database(':memory:');
    ejecutarMigraciones(db);
    retrocederA(db, 6);
    db.prepare(
      `INSERT INTO traducciones
         (creado_en, texto, traduccion, direccion, puntaje_top, puntaje_medio,
          fuente_top, ejemplos_recuperados, palabras_dudosas, vocabulario_usado, modelo)
       VALUES ('2026-10-01T00:00:00.000Z', 'nʉnka ñingui', 'agua otra vez',
               'damana_a_espanol', 0.9, 0.4, 'frases', 3, '[]', '[]', 'claude-opus-5-5')`,
    ).run();

    ejecutarMigraciones(db);

    expect(db.pragma('user_version', { simple: true })).toBe(VERSION_ACTUAL);
    const fila = db
      .prepare('SELECT texto, tokens_entrada, tokens_cache_leidos, duracion_ms FROM traducciones')
      .get() as { texto: string; tokens_entrada: number | null; tokens_cache_leidos: number | null; duracion_ms: number | null };
    expect(fila.texto).toBe('nʉnka ñingui'); // ʉ and ñ intact
    expect(fila.tokens_entrada).toBeNull();
    expect(fila.tokens_cache_leidos).toBeNull();
    expect(fila.duracion_ms).toBeNull();
    db.close();
  });

  it('pendientes and validadas restrict their enumerations', () => {
    const db = new Database(':memory:');
    ejecutarMigraciones(db);
    const pendiente = (estado: string) =>
      db
        .prepare(
          `INSERT INTO pendientes (clave, palabra, idioma, veces_pedida, estado, origen, creado_en, actualizado_en)
           VALUES (?, 'x', 'espanol', 1, ?, 'traductor', 't', 't')`,
        )
        .run(`clave-${estado}`, estado);
    expect(() => pendiente('pendiente')).not.toThrow();
    expect(() => pendiente('perdida')).toThrow();
    expect(() =>
      db
        .prepare(
          "INSERT INTO validadas (creado_en, espanol, damana, direccion, origen) VALUES ('t', 'a', 'b', 'espanol_a_damana', 'inventada')",
        )
        .run(),
    ).toThrow();
    db.close();
  });

  it('the v3 migration keeps the SRS progress of a v2 database', () => {
    const db = new Database(':memory:');
    ejecutarMigraciones(db);
    db.prepare(
      `INSERT INTO progreso_srs (palabra, repeticiones, factor_facilidad, intervalo_dias, proxima_revision, actualizado_en)
       VALUES ('nʉnka', 3, 2.5, 15, '2026-07-01T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
    ).run();
    ejecutarMigraciones(db);
    const fila = db
      .prepare('SELECT repeticiones FROM progreso_srs WHERE palabra = ?')
      .get('nʉnka') as { repeticiones: number };
    expect(fila.repeticiones).toBe(3);
    db.close();
  });

  it('accepts text with ʉ and ñ in the tables (exact binary round-trip)', () => {
    const db = new Database(':memory:');
    ejecutarMigraciones(db);
    db.prepare(
      'INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente) VALUES (?, ?, ?, ?, ?)',
    ).run('tiene', 'kʉnʉnka', 'Verbos', 'con ñ: ñingui', 'diccionario wiwa');
    const fila = db
      .prepare('SELECT rowid AS id, damana, categoria, notas FROM vocabulario')
      .get() as any;
    expect(fila.damana).toBe('kʉnʉnka');
    expect(fila.categoria).toBe('Verbos');
    expect(fila.notas).toContain('ñingui');
    expect(fila.id).toBe(1);
    db.close();
  });

  it('oraciones requires estado aprobado or revisar', () => {
    const db = new Database(':memory:');
    ejecutarMigraciones(db);
    const insertar = (estado: string) =>
      db
        .prepare(
          'INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente) VALUES (?, ?, ?, ?, ?)',
        )
        .run('x1', 'nʉnka', 'es', estado, 'prueba');
    expect(() => insertar('aprobado')).not.toThrow();
    expect(() => insertar('revisar')).not.toThrow();
    expect(() => insertar('dudoso')).toThrow();
    db.close();
  });
});
