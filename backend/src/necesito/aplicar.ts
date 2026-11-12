import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { normalize } from '../comun/texto/normalizador';
import { fixDamanaSpelling } from '../comun/texto/ortografia';
import { resolveDataDir } from '../importador/rutas-datos';
import { DAMANA_FILE, SPANISH_FILE } from './necesito';

const CSV_VOCABULARIO = 'corpus_vocabulario_v3.csv';
const NEW_SOURCE = 'lista automatica';
const BOM = String.fromCharCode(0xfeff);

export interface FilledRow {
  espanol: string;
  damana: string;
}

export interface ApplyResult {
  agregadas: FilledRow[];
  duplicadas: FilledRow[];
  sinLlenar: number;
}

/** Comparison key: the full pair, with ʉ ≠ u and ñ ≠ n. */
function key(spanish: string, damana: string): string {
  return `${normalize(spanish.trim())}|${normalize(damana.trim())}`;
}

/**
 * Decides which Excel rows are new for the glossary. It modifies nothing:
 * returning the plan lets it be tested and shown before writing.
 */
export function planChanges(
  filled: FilledRow[],
  currentVocabulary: { espanol: string; damana: string }[],
): Omit<ApplyResult, 'sinLlenar'> {
  const existing = new Set(currentVocabulary.map((v) => key(v.espanol, v.damana)));
  const added: FilledRow[] = [];
  const duplicated: FilledRow[] = [];

  for (const row of filled) {
    const spanish = row.espanol.trim();
    // Same spelling fix the importer applies (ü → ʉ).
    const damana = fixDamanaSpelling(row.damana.trim());
    const k = key(spanish, damana);
    if (existing.has(k)) {
      duplicated.push({ espanol: spanish, damana });
      continue;
    }
    existing.add(k); // avoids duplicates within the Excel itself
    added.push({ espanol: spanish, damana });
  }
  return { agregadas: added, duplicadas: duplicated };
}

/** Escapes a field for CSV only when needed. */
function field(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Text to append to the end of the CSV. It respects the file's line
 * terminator: the project's CSVs come with CRLF and mixing in LF leaves records
 * stuck together that csv-parse can no longer read.
 */
export function buildLines(
  added: FilledRow[],
  currentContent: string,
): string {
  if (added.length === 0) return '';
  const eol = currentContent.includes('\r\n') ? '\r\n' : '\n';
  const missingFinalNewline =
    currentContent.length > 0 && !/\r?\n$/.test(currentContent);
  const rows = added
    .map((f) =>
      [field(f.espanol), field(f.damana), '', '', field(NEW_SOURCE)].join(','),
    )
    .join(eol);
  return `${missingFinalNewline ? eol : ''}${rows}${eol}`;
}

/**
 * Reads a working Excel file. The first two columns are always the pair
 * (one is filled in by the speaker); `columnaEspanol` says which of them is the
 * Spanish, because the order is reversed between the two files.
 */
async function readExcel(
  filePath: string,
  spanishColumn: 1 | 2,
): Promise<{ llenadas: FilledRow[]; sinLlenar: number }> {
  const filled: FilledRow[] = [];
  let unfilled = 0;
  if (!fs.existsSync(filePath)) return { llenadas: filled, sinLlenar: unfilled };

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  const damanaColumn = spanishColumn === 1 ? 2 : 1;

  sheet.eachRow((row, num) => {
    if (num === 1) return; // header
    const spanish = String(row.getCell(spanishColumn).value ?? '').trim();
    const damana = String(row.getCell(damanaColumn).value ?? '').trim();
    if (!spanish && !damana) return;
    if (!spanish || !damana) {
      unfilled++;
      return;
    }
    filled.push({ espanol: spanish, damana });
  });
  return { llenadas: filled, sinLlenar: unfilled };
}

async function main(): Promise<void> {
  const dataDir = resolveDataDir();
  const csvPath = path.join(dataDir, CSV_VOCABULARIO);
  const spanishPath = path.join(dataDir, SPANISH_FILE);
  const damanaPath = path.join(dataDir, DAMANA_FILE);

  if (!fs.existsSync(spanishPath) && !fs.existsSync(damanaPath)) {
    console.error(
      `No se encontró ni ${SPANISH_FILE} ni ${DAMANA_FILE} en ${dataDir}.\n` +
        'Ejecuta antes: npm run necesito',
    );
    process.exit(1);
  }

  // In the Spanish→Damana file the Spanish goes first; in the other, second.
  const fromSpanish = await readExcel(spanishPath, 1);
  const fromDamana = await readExcel(damanaPath, 2);
  const filled = [...fromSpanish.llenadas, ...fromDamana.llenadas];
  const unfilled = fromSpanish.sinLlenar + fromDamana.sinLlenar;

  const vocabulary = parse(fs.readFileSync(csvPath), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
  }) as { espanol: string; damana: string }[];

  const { agregadas: added, duplicadas: duplicated } = planChanges(filled, vocabulary);

  if (added.length > 0) {
    // It is APPENDED at the end; existing rows are never rewritten or deleted.
    const current = fs.readFileSync(csvPath, 'utf8');
    fs.appendFileSync(csvPath, buildLines(added, current), 'utf8');
  }

  console.log(`\n=== ${CSV_VOCABULARIO} actualizado ===`);
  console.log(
    `Pares completos: ${filled.length}  ` +
      `(${fromSpanish.llenadas.length} de ${SPANISH_FILE}, ` +
      `${fromDamana.llenadas.length} de ${DAMANA_FILE}; sin llenar: ${unfilled})`,
  );
  console.log(`  agregadas al glosario:  ${added.length}`);
  console.log(`  omitidas por duplicadas: ${duplicated.length}`);
  added.slice(0, 10).forEach((f) => console.log(`    + ${f.espanol} = ${f.damana}`));
  duplicated.slice(0, 5).forEach((f) => console.log(`    · ya estaba: ${f.espanol} = ${f.damana}`));
  if (added.length > 0) {
    console.log('\nAhora ejecuta: npm run importar   (para que la app las use)');
  }
}

// Only runs as a CLI; importing it from a test executes nothing.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export { BOM };
