import Database from 'better-sqlite3';
import { runMigrations } from './migrations';

const CURRENT_VERSION = 7;

/**
 * Leaves a freshly migrated database as if it had stayed at an earlier
 * version: removes what later versions added and rolls back
 * user_version. This tests that migrations run over real data.
 */
function rollBackTo(db: Database.Database, version: 4 | 5 | 6): void {
  db.exec(`
    ALTER TABLE translations DROP COLUMN input_tokens;
    ALTER TABLE translations DROP COLUMN output_tokens;
    ALTER TABLE translations DROP COLUMN cache_read_tokens;
    ALTER TABLE translations DROP COLUMN cache_creation_tokens;
    ALTER TABLE translations DROP COLUMN duration_ms;
  `);
  if (version <= 5) {
    db.exec(`
      DROP TABLE rules; DROP TABLE proper_names; DROP TABLE pending_items; DROP TABLE validated_pairs;
      ALTER TABLE sentences DROP COLUMN domain;
      ALTER TABLE phrases DROP COLUMN domain;
      ALTER TABLE translations DROP COLUMN confidence;
      ALTER TABLE translations DROP COLUMN applied_rules;
      ALTER TABLE translations DROP COLUMN gloss;
    `);
  }
  if (version === 4) {
    db.exec('ALTER TABLE translations DROP COLUMN examples_in_context');
  }
  db.pragma(`user_version = ${version}`);
}

describe('runMigrations', () => {
  it('drops a database with the legacy Spanish schema and rebuilds it in English', () => {
    const db = new Database(':memory:');
    db.exec(
      "CREATE TABLE oraciones (damana TEXT); CREATE TABLE progreso_srs (palabra TEXT); INSERT INTO oraciones VALUES ('nʉnka');",
    );
    db.pragma('user_version = 7');

    runMigrations(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((f: any) => f.name);
    expect(tables).not.toContain('oraciones');
    expect(tables).not.toContain('progreso_srs');
    expect(tables).toContain('sentences');
    expect(db.pragma('user_version', { simple: true })).toBe(CURRENT_VERSION);
    db.close();
  });


  it('creates the corpus tables (v3 + v6) and the indexes', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((f: any) => f.name);
    expect(tables).toEqual([
      'conjugations',
      'damana_tokens',
      'pending_items',
      'phrases',
      'proper_names',
      'rules',
      'sentences',
      'srs_progress',
      'translations',
      'validated_pairs',
      'vocabulary',
    ]);

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all()
      .map((f: any) => f.name);
    expect(indexes).toContain('idx_tokens_word');
    expect(indexes).toContain('idx_conjugations_lemma');
    db.close();
  });

  it('is idempotent: running it twice neither fails nor duplicates', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(CURRENT_VERSION);
    db.close();
  });

  it('v5 adds ejemplos_en_contexto and leaves already logged rows as null (database stopped at v4)', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    rollBackTo(db, 4);
    db.prepare(
      `INSERT INTO translations
         (created_at, text, translation, direction, top_score, mean_score,
          top_source, retrieved_examples, doubtful_words, vocabulary_used, model)
       VALUES ('2026-07-01T00:00:00.000Z', 'nʉjkasheshisha ñingui', 'me lee otra vez',
               'damana_to_spanish', 0.9, 0.4, 'conjugations', 3, '[]', '[]', 'groq')`,
    ).run();

    runMigrations(db);

    expect(db.pragma('user_version', { simple: true })).toBe(CURRENT_VERSION);
    const row = db
      .prepare('SELECT text, examples_in_context, confidence FROM translations')
      .get() as { text: string; examples_in_context: number | null; confidence: number | null };
    expect(row.text).toBe('nʉjkasheshisha ñingui'); // ʉ and ñ intact
    expect(row.examples_in_context).toBeNull();
    expect(row.confidence).toBeNull();
    db.close();
  });

  it('v6 adds dominio with a default value to existing rows (database stopped at v5)', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    rollBackTo(db, 5);
    db.prepare(
      "INSERT INTO sentences (external_id, damana, spanish, status, source) VALUES ('o1', 'nʉnka', 'agua', 'approved', 'lfb')",
    ).run();
    db.prepare(
      "INSERT INTO phrases (source, damana, spanish, notes) VALUES ('Prueba', 'ñingui', 'otra vez', NULL)",
    ).run();

    runMigrations(db);

    expect(db.pragma('user_version', { simple: true })).toBe(CURRENT_VERSION);
    expect(db.prepare('SELECT domain FROM sentences').get()).toEqual({ domain: 'biblical' });
    expect(db.prepare('SELECT domain FROM phrases').get()).toEqual({ domain: 'everyday' });
    expect(() =>
      db
        .prepare(
          "INSERT INTO sentences (external_id, damana, spanish, status, source, domain) VALUES ('o2', 'x', 'y', 'approved', 'p', 'poesia')",
        )
        .run(),
    ).toThrow();
    db.close();
  });

  it('v7 adds the usage columns and leaves already logged rows as null (database stopped at v6)', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    rollBackTo(db, 6);
    db.prepare(
      `INSERT INTO translations
         (created_at, text, translation, direction, top_score, mean_score,
          top_source, retrieved_examples, doubtful_words, vocabulary_used, model)
       VALUES ('2026-10-01T00:00:00.000Z', 'nʉnka ñingui', 'agua otra vez',
               'damana_to_spanish', 0.9, 0.4, 'phrases', 3, '[]', '[]', 'claude-opus-5-5')`,
    ).run();

    runMigrations(db);

    expect(db.pragma('user_version', { simple: true })).toBe(CURRENT_VERSION);
    const row = db
      .prepare('SELECT text, input_tokens, cache_read_tokens, duration_ms FROM translations')
      .get() as { text: string; input_tokens: number | null; cache_read_tokens: number | null; duration_ms: number | null };
    expect(row.text).toBe('nʉnka ñingui'); // ʉ and ñ intact
    expect(row.input_tokens).toBeNull();
    expect(row.cache_read_tokens).toBeNull();
    expect(row.duration_ms).toBeNull();
    db.close();
  });

  it('pendientes and validadas restrict their enumerations', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    const pendingItem = (status: string) =>
      db
        .prepare(
          `INSERT INTO pending_items (lookup_key, word, language, times_requested, status, origin, created_at, updated_at)
           VALUES (?, 'x', 'spanish', 1, ?, 'translator', 't', 't')`,
        )
        .run(`clave-${status}`, status);
    expect(() => pendingItem('pending')).not.toThrow();
    expect(() => pendingItem('perdida')).toThrow();
    expect(() =>
      db
        .prepare(
          "INSERT INTO validated_pairs (created_at, spanish, damana, direction, origin) VALUES ('t', 'a', 'b', 'spanish_to_damana', 'inventada')",
        )
        .run(),
    ).toThrow();
    db.close();
  });

  it('the v3 migration keeps the SRS progress of a v2 database', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    db.prepare(
      `INSERT INTO srs_progress (word, repetitions, ease_factor, interval_days, next_review, updated_at)
       VALUES ('nʉnka', 3, 2.5, 15, '2026-07-01T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
    ).run();
    runMigrations(db);
    const row = db
      .prepare('SELECT repetitions FROM srs_progress WHERE word = ?')
      .get('nʉnka') as { repetitions: number };
    expect(row.repetitions).toBe(3);
    db.close();
  });

  it('accepts text with ʉ and ñ in the tables (exact binary round-trip)', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    db.prepare(
      'INSERT INTO vocabulary (spanish, damana, category, notes, source) VALUES (?, ?, ?, ?, ?)',
    ).run('tiene', 'kʉnʉnka', 'Verbos', 'con ñ: ñingui', 'diccionario wiwa');
    const row = db
      .prepare('SELECT rowid AS id, damana, category, notes FROM vocabulary')
      .get() as any;
    expect(row.damana).toBe('kʉnʉnka');
    expect(row.category).toBe('Verbos');
    expect(row.notes).toContain('ñingui');
    expect(row.id).toBe(1);
    db.close();
  });

  it('oraciones requires estado aprobado or revisar', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    const insert = (status: string) =>
      db
        .prepare(
          'INSERT INTO sentences (external_id, damana, spanish, status, source) VALUES (?, ?, ?, ?, ?)',
        )
        .run('x1', 'nʉnka', 'es', status, 'prueba');
    expect(() => insert('approved')).not.toThrow();
    expect(() => insert('review')).not.toThrow();
    expect(() => insert('dudoso')).toThrow();
    db.close();
  });
});
