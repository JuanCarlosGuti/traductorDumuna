import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { runMigrations } from '../database/migrations';
import { TranslationTest } from '../importer/elicitation';
import { TESTS_FILE, writeTests } from '../importer/tests-csv';
import { resolveDataDir, defaultDbPath } from '../importer/data-paths';
import { ValidatedPair, ValidatedRepository } from '../translation/validated.repository';

/** Scope under which they enter the CSV, to see them separately in the report. */
export const VALIDATED_SCOPE = 'validadas';

/**
 * Validated pairs → rows of pruebas_traduccion.csv. The pair already comes with the
 * Spanish and the Damana in place whatever the direction in which it was
 * translated (TranslationService.validar places them), and the evaluation always
 * translates Spanish → Damana. Pairs with an empty side are discarded.
 */
export function testsFromValidated(validatedPairs: ValidatedPair[]): TranslationTest[] {
  return validatedPairs
    .map((v) => ({
      espanol: v.espanol.trim(),
      damanaEsperado: v.damana.trim(),
      ambito: VALIDATED_SCOPE,
    }))
    .filter((p) => p.espanol.length > 0 && p.damanaEsperado.length > 0);
}

export interface ExportResult {
  /** Validated pairs that were in the database. */
  validadas: number;
  /** How many entered the CSV as new (repeated ones are not duplicated). */
  agregadas: number;
  /** Tests left in the CSV. */
  total: number;
}

/**
 * Idempotent: writeTests merges by normalized Spanish/Damana pair,
 * so running it twice — or validating the same pair twice — does not repeat
 * rows, and it never deletes tests that were already there (from the importer or by hand).
 */
export function exportValidatedToTests(
  db: Database.Database,
  dataDir: string,
): ExportResult {
  const validatedPairs = new ValidatedRepository(db).listAll();
  const result = writeTests(dataDir, testsFromValidated(validatedPairs));
  return { validadas: validatedPairs.length, ...result };
}

function main(): void {
  const dataDir = resolveDataDir();
  const dbPath = defaultDbPath();
  if (!fs.existsSync(dbPath)) {
    console.error(`No existe ${dbPath}. Ejecuta antes: npm run importar`);
    process.exit(1);
  }
  // Same opening as the app (database.module.ts): migrations are
  // idempotent and guarantee that the validadas table exists.
  const db = new Database(dbPath);
  try {
    runMigrations(db);
    const r = exportValidatedToTests(db, dataDir);
    console.log(
      `${r.validadas} pares validados en la base; ${r.agregadas} nuevos añadidos a ` +
        `${path.join(dataDir, TESTS_FILE)} (${r.total} pruebas en total).`,
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
