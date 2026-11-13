import type { Database } from 'better-sqlite3';

// Schema versioned with PRAGMA user_version. Each array position is
// a version; the missing ones are applied in order. The DB is regenerable
// (the importer does DELETE + INSERT), so there are no data migrations.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE chapters (
    chapter INTEGER NOT NULL,
    damana_title TEXT NOT NULL,
    spanish_title TEXT NOT NULL,
    damana TEXT NOT NULL,
    spanish TEXT NOT NULL
  );

  CREATE TABLE phrases (
    source TEXT NOT NULL,
    damana TEXT NOT NULL,
    spanish TEXT,
    notes TEXT
  );

  CREATE TABLE vocabulary (
    spanish TEXT NOT NULL,
    damana TEXT NOT NULL,
    notes TEXT
  );

  CREATE TABLE damana_tokens (
    normalized_word TEXT NOT NULL,
    original_word TEXT NOT NULL,
    source_table TEXT NOT NULL
      CHECK (source_table IN ('chapters', 'phrases', 'vocabulary')),
    source_id INTEGER NOT NULL,
    position INTEGER NOT NULL
  );

  CREATE INDEX idx_tokens_word ON damana_tokens (normalized_word);
  `,
  // v2: spaced-repetition progress (simplified SM-2). The importer does not
  // touch it: it survives corpus re-imports.
  `
  CREATE TABLE srs_progress (
    word TEXT PRIMARY KEY,
    repetitions INTEGER NOT NULL DEFAULT 0,
    ease_factor REAL NOT NULL DEFAULT 2.5,
    interval_days REAL NOT NULL DEFAULT 0,
    next_review TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  // v3 (corpus v3): chapters → sentences (sentence-by-sentence pairs, with
  // alignment state), vocabulary with category/source, and the new
  // conjugations table. Content tables are rebuilt (the DB
  // is regenerable with the importer); srs_progress is kept intact.
  `
  DROP TABLE chapters;
  DROP TABLE phrases;
  DROP TABLE vocabulary;
  DROP TABLE damana_tokens;

  CREATE TABLE sentences (
    external_id TEXT NOT NULL,
    damana TEXT NOT NULL,
    spanish TEXT,
    status TEXT NOT NULL CHECK (status IN ('approved', 'review')),
    source TEXT
  );

  CREATE TABLE phrases (
    source TEXT,
    damana TEXT NOT NULL,
    spanish TEXT,
    notes TEXT
  );

  CREATE TABLE vocabulary (
    spanish TEXT NOT NULL,
    damana TEXT NOT NULL,
    category TEXT,
    notes TEXT,
    source TEXT
  );

  CREATE TABLE conjugations (
    damana TEXT NOT NULL,
    spanish TEXT NOT NULL,
    lemma TEXT NOT NULL,
    source TEXT,
    notes TEXT
  );
  CREATE INDEX idx_conjugations_lemma ON conjugations (lemma);

  CREATE TABLE damana_tokens (
    normalized_word TEXT NOT NULL,
    original_word TEXT NOT NULL,
    source_table TEXT NOT NULL
      CHECK (source_table IN ('sentences', 'phrases', 'vocabulary', 'conjugations')),
    source_id INTEGER NOT NULL,
    position INTEGER NOT NULL
  );
  CREATE INDEX idx_tokens_word ON damana_tokens (normalized_word);
  `,
  // v4: translation log for active learning — what was asked and
  // with how much corpus support it was solved. Like srs_progress, the
  // importer does NOT touch it: it survives corpus re-imports.
  `
  CREATE TABLE translations (
    created_at TEXT NOT NULL,
    text TEXT NOT NULL,
    translation TEXT NOT NULL,
    direction TEXT NOT NULL
      CHECK (direction IN ('damana_to_spanish', 'spanish_to_damana')),
    -- Retrieval support signals: the top one can mislead (it may come from a
    -- dictionary entry); the mean of the K examples is what discriminates.
    top_score REAL NOT NULL,
    mean_score REAL NOT NULL,
    top_source TEXT,
    retrieved_examples INTEGER NOT NULL,
    doubtful_words TEXT NOT NULL,
    vocabulary_used TEXT NOT NULL,
    model TEXT
  );
  CREATE INDEX idx_translations_created ON translations (created_at);
  `,
  // v5: how many of the examples came from sentences or phrases, that is, from the
  // verb or word IN USE. It used to be inferred from the top-1, but since
  // retrieval expands by verb root a conjugations top-1 no longer implies
  // that there is no context underneath. Nullable on purpose: rows older than
  // this column do not know it, and NULL tells them apart from a real 0.
  `
  ALTER TABLE translations ADD COLUMN examples_in_context INTEGER;
  `,
  // v6 (general-purpose translator, Oct 2026):
  //  - domain in sentences and phrases: 'biblical' (lfb booklet), 'everyday'
  //    (elicitation with speakers, phrases from meetings/questions) or
  //    'grammar' (reserved; conjugations carry it implicitly).
  //  - rules and proper_names: content of reglas_damana.xlsx. The
  //    importer rebuilds them like the rest of the corpus.
  //  - pending_items: words the translator could not translate or that
  //    elicitation left unfilled; they are exported to the native speakers.
  //  - validated_pairs: pairs the user confirmed or corrected in the translator.
  //  Like srs_progress and translations, pending_items and validated_pairs are NOT touched
  //  by the importer: they survive re-imports.
  //  In translations, doubtful_words now stores the words WITHOUT AN
  //  EQUIVALENT (same concept, new name in the API); the column is not
  //  renamed so as not to rewrite the history.
  `
  ALTER TABLE sentences ADD COLUMN domain TEXT NOT NULL DEFAULT 'biblical'
    CHECK (domain IN ('biblical', 'everyday', 'grammar'));
  ALTER TABLE phrases ADD COLUMN domain TEXT NOT NULL DEFAULT 'everyday'
    CHECK (domain IN ('biblical', 'everyday', 'grammar'));

  CREATE TABLE rules (
    kind TEXT,
    form TEXT NOT NULL,
    meaning TEXT,
    base_example TEXT,
    rule_example TEXT,
    example_translation TEXT,
    notes TEXT,
    -- Which feature of the input phrase activates the rule: plural, possessive,
    -- negation, question, past, future. NULL = general rule (always applies).
    trigger_feature TEXT
  );

  CREATE TABLE proper_names (
    damana TEXT NOT NULL,
    spanish TEXT NOT NULL,
    same_spelling INTEGER NOT NULL DEFAULT 1,
    other_spellings TEXT,
    notes TEXT
  );

  CREATE TABLE pending_items (
    -- Normalized key (lowercase, no accents; ʉ and ñ kept intact).
    lookup_key TEXT PRIMARY KEY,
    word TEXT NOT NULL,
    language TEXT NOT NULL CHECK (language IN ('spanish', 'damana')),
    context TEXT,
    times_requested INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'exported', 'resolved')),
    origin TEXT NOT NULL CHECK (origin IN ('translator', 'elicitation')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE validated_pairs (
    created_at TEXT NOT NULL,
    spanish TEXT NOT NULL,
    damana TEXT NOT NULL,
    direction TEXT NOT NULL
      CHECK (direction IN ('damana_to_spanish', 'spanish_to_damana')),
    origin TEXT NOT NULL CHECK (origin IN ('confirmed', 'corrected')),
    model_translation TEXT
  );

  ALTER TABLE translations ADD COLUMN confidence REAL;
  ALTER TABLE translations ADD COLUMN applied_rules TEXT;
  ALTER TABLE translations ADD COLUMN gloss TEXT;
  `,
  // v7: usage of each translation — input and output tokens, tokens
  // served and written by the prompt cache, and duration — to track
  // Anthropic credit spending and check that the cache kicks in.
  // Nullable on purpose: earlier rows do not know it and compatible
  // providers may not report it.
  `
  ALTER TABLE translations ADD COLUMN input_tokens INTEGER;
  ALTER TABLE translations ADD COLUMN output_tokens INTEGER;
  ALTER TABLE translations ADD COLUMN cache_read_tokens INTEGER;
  ALTER TABLE translations ADD COLUMN cache_creation_tokens INTEGER;
  ALTER TABLE translations ADD COLUMN duration_ms INTEGER;
  `,
];

/**
 * Tables of the schema used before November 2026, when table and column
 * names were still in Spanish. A database with that schema is dropped and
 * rebuilt from scratch: content tables are regenerated by the importer, and
 * in production the database is baked into the image on every deployment, so
 * only a local development database can lose its runtime rows (SRS progress,
 * translation log, pending and validated items).
 */
const LEGACY_TABLES = [
  'oraciones',
  'frases',
  'vocabulario',
  'conjugaciones',
  'tokens_damana',
  'progreso_srs',
  'traducciones',
  'reglas',
  'nombres_propios',
  'pendientes',
  'validadas',
  'capitulos',
];

function dropLegacySchema(db: Database): void {
  const hasLegacy = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'oraciones'")
    .get();
  if (!hasLegacy) return;
  for (const table of LEGACY_TABLES) {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
  db.pragma('user_version = 0');
}

export function runMigrations(db: Database): void {
  dropLegacySchema(db);
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.exec(MIGRATIONS[version]);
    db.pragma(`user_version = ${version + 1}`);
  }
}
