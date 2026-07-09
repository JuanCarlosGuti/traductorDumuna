import type { Database } from 'better-sqlite3';

// Esquema versionado con PRAGMA user_version. Cada posición del array es
// una versión; se aplican en orden las que falten. La DB es regenerable
// (el importador hace DELETE + INSERT), así que no hay migraciones de datos.
const MIGRACIONES: string[] = [
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
  // v2: progreso de repetición espaciada (SM-2 simplificado). No la toca
  // el importador: sobrevive a las reimportaciones del corpus.
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
  // v3 (corpus v3): capitulos → oraciones (pares oración a oración, con
  // estado de alineación), vocabulario con categoria/fuente, y la tabla
  // nueva conjugaciones. Las tablas de contenido se reconstruyen (la DB
  // es regenerable con el importador); progreso_srs se conserva intacta.
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
];

export function ejecutarMigraciones(db: Database): void {
  const actual = db.pragma('user_version', { simple: true }) as number;
  for (let version = actual; version < MIGRACIONES.length; version++) {
    db.exec(MIGRACIONES[version]);
    db.pragma(`user_version = ${version + 1}`);
  }
}
