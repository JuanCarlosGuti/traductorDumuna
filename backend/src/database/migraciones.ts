import type { Database } from 'better-sqlite3';

// Schema versioned with PRAGMA user_version. Each array position is
// a version; the missing ones are applied in order. The DB is regenerable
// (the importer does DELETE + INSERT), so there are no data migrations.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE capitulos (
    capitulo INTEGER NOT NULL,
    titulo_damana TEXT NOT NULL,
    titulo_espanol TEXT NOT NULL,
    damana TEXT NOT NULL,
    espanol TEXT NOT NULL
  );

  CREATE TABLE frases (
    fuente TEXT NOT NULL,
    damana TEXT NOT NULL,
    espanol TEXT,
    notas TEXT
  );

  CREATE TABLE vocabulario (
    espanol TEXT NOT NULL,
    damana TEXT NOT NULL,
    notas TEXT
  );

  CREATE TABLE tokens_damana (
    palabra_normalizada TEXT NOT NULL,
    palabra_original TEXT NOT NULL,
    tabla_origen TEXT NOT NULL
      CHECK (tabla_origen IN ('capitulos', 'frases', 'vocabulario')),
    id_origen INTEGER NOT NULL,
    posicion INTEGER NOT NULL
  );

  CREATE INDEX idx_tokens_palabra ON tokens_damana (palabra_normalizada);
  `,
  // v2: spaced-repetition progress (simplified SM-2). The importer does not
  // touch it: it survives corpus re-imports.
  `
  CREATE TABLE progreso_srs (
    palabra TEXT PRIMARY KEY,
    repeticiones INTEGER NOT NULL DEFAULT 0,
    factor_facilidad REAL NOT NULL DEFAULT 2.5,
    intervalo_dias REAL NOT NULL DEFAULT 0,
    proxima_revision TEXT NOT NULL,
    actualizado_en TEXT NOT NULL
  );
  `,
  // v3 (corpus v3): capitulos → oraciones (sentence-by-sentence pairs, with
  // alignment state), vocabulario with categoria/fuente, and the new
  // conjugaciones table. Content tables are rebuilt (the DB
  // is regenerable with the importer); progreso_srs is kept intact.
  `
  DROP TABLE capitulos;
  DROP TABLE frases;
  DROP TABLE vocabulario;
  DROP TABLE tokens_damana;

  CREATE TABLE oraciones (
    id_externo TEXT NOT NULL,
    damana TEXT NOT NULL,
    espanol TEXT,
    estado TEXT NOT NULL CHECK (estado IN ('aprobado', 'revisar')),
    fuente TEXT
  );

  CREATE TABLE frases (
    fuente TEXT,
    damana TEXT NOT NULL,
    espanol TEXT,
    notas TEXT
  );

  CREATE TABLE vocabulario (
    espanol TEXT NOT NULL,
    damana TEXT NOT NULL,
    categoria TEXT,
    notas TEXT,
    fuente TEXT
  );

  CREATE TABLE conjugaciones (
    damana TEXT NOT NULL,
    espanol TEXT NOT NULL,
    lema TEXT NOT NULL,
    fuente TEXT,
    notas TEXT
  );
  CREATE INDEX idx_conjugaciones_lema ON conjugaciones (lema);

  CREATE TABLE tokens_damana (
    palabra_normalizada TEXT NOT NULL,
    palabra_original TEXT NOT NULL,
    tabla_origen TEXT NOT NULL
      CHECK (tabla_origen IN ('oraciones', 'frases', 'vocabulario', 'conjugaciones')),
    id_origen INTEGER NOT NULL,
    posicion INTEGER NOT NULL
  );
  CREATE INDEX idx_tokens_palabra ON tokens_damana (palabra_normalizada);
  `,
  // v4: translation log for active learning — what was asked and
  // with how much corpus support it was solved. Like progreso_srs, the
  // importer does NOT touch it: it survives corpus re-imports.
  `
  CREATE TABLE traducciones (
    creado_en TEXT NOT NULL,
    texto TEXT NOT NULL,
    traduccion TEXT NOT NULL,
    direccion TEXT NOT NULL
      CHECK (direccion IN ('damana_a_espanol', 'espanol_a_damana')),
    -- Señales de apoyo del retrieval: el top engaña (puede venir de una
    -- entrada de diccionario), la media de los K es la que discrimina.
    puntaje_top REAL NOT NULL,
    puntaje_medio REAL NOT NULL,
    fuente_top TEXT,
    ejemplos_recuperados INTEGER NOT NULL,
    palabras_dudosas TEXT NOT NULL,
    vocabulario_usado TEXT NOT NULL,
    modelo TEXT
  );
  CREATE INDEX idx_traducciones_creado ON traducciones (creado_en);
  `,
  // v5: how many of the examples came from sentences or phrases, that is, from the
  // verb or word IN USE. It used to be inferred from the top-1, but since
  // retrieval expands by verb root a conjugations top-1 no longer implies
  // that there is no context underneath. Nullable on purpose: rows older than
  // this column do not know it, and NULL tells them apart from a real 0.
  `
  ALTER TABLE traducciones ADD COLUMN ejemplos_en_contexto INTEGER;
  `,
  // v6 (general-purpose translator, Oct 2026):
  //  - dominio in oraciones and frases: 'biblico' (lfb booklet), 'cotidiano'
  //    (elicitation with speakers, phrases from meetings/questions) or
  //    'gramatica' (reserved; conjugations carry it implicitly).
  //  - reglas and nombres_propios: content of reglas_damana.xlsx. The
  //    importer rebuilds them like the rest of the corpus.
  //  - pendientes: words the translator could not translate or that
  //    elicitation left unfilled; they are exported to the native speakers.
  //  - validadas: pairs the user confirmed or corrected in the translator.
  //  Like progreso_srs and traducciones, pendientes and validadas are NOT touched
  //  by the importer: they survive re-imports.
  //  In traducciones, palabras_dudosas now stores the words WITHOUT AN
  //  EQUIVALENT (same concept, new name in the API); the column is not
  //  renamed so as not to rewrite the history.
  `
  ALTER TABLE oraciones ADD COLUMN dominio TEXT NOT NULL DEFAULT 'biblico'
    CHECK (dominio IN ('biblico', 'cotidiano', 'gramatica'));
  ALTER TABLE frases ADD COLUMN dominio TEXT NOT NULL DEFAULT 'cotidiano'
    CHECK (dominio IN ('biblico', 'cotidiano', 'gramatica'));

  CREATE TABLE reglas (
    tipo TEXT,
    forma TEXT NOT NULL,
    significado TEXT,
    ejemplo_base TEXT,
    ejemplo_regla TEXT,
    traduccion_ejemplo TEXT,
    notas TEXT,
    -- Qué rasgo de la frase de entrada activa la regla: plural, posesivo,
    -- negacion, pregunta, pasado, futuro. NULL = regla general (siempre).
    disparador TEXT
  );

  CREATE TABLE nombres_propios (
    damana TEXT NOT NULL,
    espanol TEXT NOT NULL,
    se_escribe_igual INTEGER NOT NULL DEFAULT 1,
    otras_grafias TEXT,
    notas TEXT
  );

  CREATE TABLE pendientes (
    -- Clave normalizada (minúsculas, sin tildes; ʉ y ñ intactas).
    clave TEXT PRIMARY KEY,
    palabra TEXT NOT NULL,
    idioma TEXT NOT NULL CHECK (idioma IN ('espanol', 'damana')),
    contexto TEXT,
    veces_pedida INTEGER NOT NULL DEFAULT 1,
    estado TEXT NOT NULL DEFAULT 'pendiente'
      CHECK (estado IN ('pendiente', 'exportada', 'resuelta')),
    origen TEXT NOT NULL CHECK (origen IN ('traductor', 'elicitacion')),
    creado_en TEXT NOT NULL,
    actualizado_en TEXT NOT NULL
  );

  CREATE TABLE validadas (
    creado_en TEXT NOT NULL,
    espanol TEXT NOT NULL,
    damana TEXT NOT NULL,
    direccion TEXT NOT NULL
      CHECK (direccion IN ('damana_a_espanol', 'espanol_a_damana')),
    origen TEXT NOT NULL CHECK (origen IN ('confirmada', 'corregida')),
    traduccion_modelo TEXT
  );

  ALTER TABLE traducciones ADD COLUMN confianza REAL;
  ALTER TABLE traducciones ADD COLUMN reglas_aplicadas TEXT;
  ALTER TABLE traducciones ADD COLUMN glosa TEXT;
  `,
  // v7: usage of each translation — input and output tokens, tokens
  // served and written by the prompt cache, and duration — to track
  // Anthropic credit spending and check that the cache kicks in.
  // Nullable on purpose: earlier rows do not know it and compatible
  // providers may not report it.
  `
  ALTER TABLE traducciones ADD COLUMN tokens_entrada INTEGER;
  ALTER TABLE traducciones ADD COLUMN tokens_salida INTEGER;
  ALTER TABLE traducciones ADD COLUMN tokens_cache_leidos INTEGER;
  ALTER TABLE traducciones ADD COLUMN tokens_cache_creados INTEGER;
  ALTER TABLE traducciones ADD COLUMN duracion_ms INTEGER;
  `,
];

export function runMigrations(db: Database): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.exec(MIGRATIONS[version]);
    db.pragma(`user_version = ${version + 1}`);
  }
}
