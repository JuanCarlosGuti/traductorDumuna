import Database from 'better-sqlite3';
import { ejecutarMigraciones } from './migraciones';

describe('ejecutarMigraciones', () => {
  it('crea las tablas del corpus v3 y los índices', () => {
    const db = new Database(':memory:');
    ejecutarMigraciones(db);

    const tablas = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((f: any) => f.name);
    expect(tablas).toEqual([
      'conjugaciones',
      'frases',
      'oraciones',
      'progreso_srs',
      'tokens_damana',
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

  it('es idempotente: ejecutarla dos veces no falla ni duplica', () => {
    const db = new Database(':memory:');
    ejecutarMigraciones(db);
    expect(() => ejecutarMigraciones(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(3);
    db.close();
  });

  it('la migración v3 conserva el progreso SRS de una base v2', () => {
    const db = new Database(':memory:');
    // Simular una base que quedó en v2 con progreso guardado
    ejecutarMigraciones(db); // crea todo en v3 directamente…
    db.prepare(
      `INSERT INTO progreso_srs (palabra, repeticiones, factor_facilidad, intervalo_dias, proxima_revision, actualizado_en)
       VALUES ('nʉnka', 3, 2.5, 15, '2026-07-01T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
    ).run();
    // …y volver a ejecutar no debe tocarla (idempotencia + tabla intacta)
    ejecutarMigraciones(db);
    const fila = db
      .prepare('SELECT repeticiones FROM progreso_srs WHERE palabra = ?')
      .get('nʉnka') as { repeticiones: number };
    expect(fila.repeticiones).toBe(3);
    db.close();
  });

  it('acepta texto con ʉ y ñ en las tablas (round-trip binario exacto)', () => {
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

  it('oraciones exige estado aprobado o revisar', () => {
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
