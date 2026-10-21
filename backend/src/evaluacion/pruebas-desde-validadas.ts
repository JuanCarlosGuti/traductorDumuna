import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { ejecutarMigraciones } from '../database/migraciones';
import { PruebaTraduccion } from '../importador/elicitacion';
import { ARCHIVO_PRUEBAS, escribirPruebas } from '../importador/pruebas-csv';
import { resolverDirDatos, rutaDbPorDefecto } from '../importador/rutas-datos';
import { Validada, ValidadasRepository } from '../traduccion/validadas.repository';

/** Ámbito con el que entran al CSV, para verlas aparte en el informe. */
export const AMBITO_VALIDADAS = 'validadas';

/**
 * Pares validados → filas de pruebas_traduccion.csv. El par ya viene con el
 * español y el damana en su sitio sea cual fuera la dirección en que se
 * tradujo (lo coloca TraduccionService.validar), y la evaluación siempre
 * traduce español → damana. Se descartan los pares con un lado vacío.
 */
export function pruebasDesdeValidadas(validadas: Validada[]): PruebaTraduccion[] {
  return validadas
    .map((v) => ({
      espanol: v.espanol.trim(),
      damanaEsperado: v.damana.trim(),
      ambito: AMBITO_VALIDADAS,
    }))
    .filter((p) => p.espanol.length > 0 && p.damanaEsperado.length > 0);
}

export interface ResultadoExportacion {
  /** Pares validados que había en la base. */
  validadas: number;
  /** Cuántos entraron nuevos al CSV (los repetidos no se duplican). */
  agregadas: number;
  /** Pruebas que quedan en el CSV. */
  total: number;
}

/**
 * Idempotente: escribirPruebas funde por pareja español/damana normalizada,
 * así que correrlo dos veces —o validar dos veces el mismo par— no repite
 * filas, y nunca borra las pruebas que ya hubiera (del importador o a mano).
 */
export function exportarValidadasAPruebas(
  db: Database.Database,
  dirDatos: string,
): ResultadoExportacion {
  const validadas = new ValidadasRepository(db).listar();
  const resultado = escribirPruebas(dirDatos, pruebasDesdeValidadas(validadas));
  return { validadas: validadas.length, ...resultado };
}

function main(): void {
  const dirDatos = resolverDirDatos();
  const rutaDb = rutaDbPorDefecto();
  if (!fs.existsSync(rutaDb)) {
    console.error(`No existe ${rutaDb}. Ejecuta antes: npm run importar`);
    process.exit(1);
  }
  // Misma apertura que la app (database.module.ts): las migraciones son
  // idempotentes y garantizan que la tabla validadas exista.
  const db = new Database(rutaDb);
  try {
    ejecutarMigraciones(db);
    const r = exportarValidadasAPruebas(db, dirDatos);
    console.log(
      `${r.validadas} pares validados en la base; ${r.agregadas} nuevos añadidos a ` +
        `${path.join(dirDatos, ARCHIVO_PRUEBAS)} (${r.total} pruebas en total).`,
    );
    if (r.validadas === 0) {
      console.log(
        'Todavía no hay pares validados: en la vista Traductor, «esta traducción es correcta» o «corregir».',
      );
    }
  } finally {
    db.close();
  }
}

// Solo corre como CLI; al importarlo desde un test no ejecuta nada.
if (require.main === module) main();
