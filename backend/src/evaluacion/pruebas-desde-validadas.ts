import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { ejecutarMigraciones } from '../database/migraciones';
import { PruebaTraduccion } from '../importador/elicitacion';
import { ARCHIVO_PRUEBAS, escribirPruebas } from '../importador/pruebas-csv';
import { resolverDirDatos, rutaDbPorDefecto } from '../importador/rutas-datos';
import { Validada, ValidadasRepository } from '../traduccion/validadas.repository';

/** Scope under which they enter the CSV, to see them separately in the report. */
export const AMBITO_VALIDADAS = 'validadas';

/**
 * Validated pairs → rows of pruebas_traduccion.csv. The pair already comes with the
 * Spanish and the Damana in place whatever the direction in which it was
 * translated (TraduccionService.validar places them), and the evaluation always
 * translates Spanish → Damana. Pairs with an empty side are discarded.
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
  /** Validated pairs that were in the database. */
  validadas: number;
  /** How many entered the CSV as new (repeated ones are not duplicated). */
  agregadas: number;
  /** Tests left in the CSV. */
  total: number;
}

/**
 * Idempotent: escribirPruebas merges by normalized Spanish/Damana pair,
 * so running it twice — or validating the same pair twice — does not repeat
 * rows, and it never deletes tests that were already there (from the importer or by hand).
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
  // Same opening as the app (database.module.ts): migrations are
  // idempotent and guarantee that the validadas table exists.
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

// Only runs as a CLI; importing it from a test executes nothing.
if (require.main === module) main();
