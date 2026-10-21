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
  // v4: registro de traducciones para aprendizaje activo — qué se pidió y
  // con cuánto apoyo del corpus se resolvió. Como progreso_srs, el
  // importador NO la toca: sobrevive a las reimportaciones del corpus.
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
  // v5: cuántos de los ejemplos venían de oraciones o frases, es decir, del
  // verbo o la palabra EN USO. Antes se deducía del top-1, pero desde que el
  // retrieval expande por raíz verbal un top-1 de conjugaciones ya no implica
  // que no haya contexto debajo. Nullable a propósito: las filas anteriores a
  // esta columna no lo saben, y NULL las distingue de un 0 real.
  `
  ALTER TABLE traducciones ADD COLUMN ejemplos_en_contexto INTEGER;
  `,
  // v6 (traductor de propósito general, oct 2026):
  //  - dominio en oraciones y frases: 'biblico' (folleto lfb), 'cotidiano'
  //    (elicitación con hablantes, frases de reuniones/preguntas) o
  //    'gramatica' (reservado; las conjugaciones lo llevan implícito).
  //  - reglas y nombres_propios: contenido de reglas_damana.xlsx. El
  //    importador las reconstruye como al resto del corpus.
  //  - pendientes: palabras que el traductor no supo traducir o que la
  //    elicitación dejó sin llenar; se exportan a las hablantes nativas.
  //  - validadas: pares que el usuario confirmó o corrigió en el traductor.
  //  Como progreso_srs y traducciones, pendientes y validadas NO las toca
  //  el importador: sobreviven a las reimportaciones.
  //  En traducciones, palabras_dudosas pasa a guardar las palabras SIN
  //  EQUIVALENTE (mismo concepto, nombre nuevo en la API); no se renombra
  //  la columna para no reescribir el histórico.
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
  // v7: consumo de cada traducción —tokens de entrada y salida, tokens
  // servidos y escritos por la caché de prompts, y duración— para seguir el
  // gasto de los créditos de Anthropic y comprobar que la caché entra.
  // Nullable a propósito: las filas anteriores no lo saben y los proveedores
  // compatibles pueden no informarlo.
  `
  ALTER TABLE traducciones ADD COLUMN tokens_entrada INTEGER;
  ALTER TABLE traducciones ADD COLUMN tokens_salida INTEGER;
  ALTER TABLE traducciones ADD COLUMN tokens_cache_leidos INTEGER;
  ALTER TABLE traducciones ADD COLUMN tokens_cache_creados INTEGER;
  ALTER TABLE traducciones ADD COLUMN duracion_ms INTEGER;
  `,
];

export function ejecutarMigraciones(db: Database): void {
  const actual = db.pragma('user_version', { simple: true }) as number;
  for (let version = actual; version < MIGRACIONES.length; version++) {
    db.exec(MIGRACIONES[version]);
    db.pragma(`user_version = ${version + 1}`);
  }
}
