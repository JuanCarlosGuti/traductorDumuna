import Database from 'better-sqlite3';
import { ejecutarMigraciones } from './migraciones';

describe('ejecutarMigraciones', () => {
  it('crea las cuatro tablas y el índice de tokens', () => {
    const db = new Database(':memory:');
    ejecutarMigraciones(db);

    const tablas = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((f: any) => f.name);
    expect(tablas).toEqual([
      'capitulos',
      'frases',
      'progreso_srs',
      'tokens_damana',
      'vocabulario',
    ]);

    const indices = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all()
      .map((f: any) => f.name);
    expect(indices).toContain('idx_tokens_palabra');
    db.close();
  });

  it('es idempotente: ejecutarla dos veces no falla ni duplica', () => {
    const db = new Database(':memory:');
    ejecutarMigraciones(db);
    expect(() => ejecutarMigraciones(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(2);
    db.close();
  });

  it('acepta texto con ʉ y ñ en las tablas (round-trip binario exacto)', () => {
    const db = new Database(':memory:');
    ejecutarMigraciones(db);
    db.prepare(
      'INSERT INTO vocabulario (espanol, damana, notas) VALUES (?, ?, ?)',
    ).run('tiene', 'kʉnʉnka', 'con ñ: ñingui');
    const fila = db
      .prepare('SELECT rowid AS id, damana, notas FROM vocabulario')
      .get() as any;
    expect(fila.damana).toBe('kʉnʉnka');
    expect(fila.notas).toContain('ñingui');
    expect(fila.id).toBe(1);
    db.close();
  });
});
