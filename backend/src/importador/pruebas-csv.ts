import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { normalize } from '../comun/texto/normalizador';
import { TranslationTest } from './elicitacion';

export const TESTS_FILE = 'pruebas_traduccion.csv';
const BOM = String.fromCharCode(0xfeff);
const EOL = '\r\n'; // same terminator as the rest of the project's CSVs

function field(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function key(p: TranslationTest): string {
  return `${normalize(p.espanol.trim())}|${normalize(p.damanaEsperado.trim())}`;
}

/** Reads the tests CSV (espanol, damana_esperado, ambito); empty if it does not exist. */
export function readTests(dataDir: string): TranslationTest[] {
  const filePath = path.join(dataDir, TESTS_FILE);
  if (!fs.existsSync(filePath)) return [];
  const rows = parse(fs.readFileSync(filePath), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
  }) as { espanol: string; damana_esperado: string; ambito: string }[];
  return rows
    .filter((f) => f.espanol && f.damana_esperado)
    .map((f) => ({
      espanol: f.espanol,
      damanaEsperado: f.damana_esperado,
      ambito: f.ambito || 'otro',
    }));
}

/**
 * Merges the tests reserved by the importer with those already
 * in the file (e.g. added by hand) and rewrites it. Idempotent: the
 * same Spanish/Damana pair is not repeated. It never deletes existing rows.
 */
export function writeTests(
  dataDir: string,
  newItems: TranslationTest[],
): { total: number; agregadas: number } {
  const existing = readTests(dataDir);
  const seen = new Set(existing.map(key));
  const added = newItems.filter((p) => {
    const k = key(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const all = [...existing, ...added];
  const lines = [
    'espanol,damana_esperado,ambito',
    ...all.map((p) => [field(p.espanol), field(p.damanaEsperado), field(p.ambito)].join(',')),
  ];
  fs.writeFileSync(path.join(dataDir, TESTS_FILE), BOM + lines.join(EOL) + EOL, 'utf8');
  return { total: all.length, agregadas: added.length };
}
