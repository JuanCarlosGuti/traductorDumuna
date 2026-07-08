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
];

export function ejecutarMigraciones(db: Database): void {
  const actual = db.pragma('user_version', { simple: true }) as number;
  for (let version = actual; version < MIGRACIONES.length; version++) {
    db.exec(MIGRACIONES[version]);
    db.pragma(`user_version = ${version + 1}`);
  }
}
