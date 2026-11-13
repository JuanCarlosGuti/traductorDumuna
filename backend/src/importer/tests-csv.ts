import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { normalize } from '../common/text/normalizer';
import { TranslationTest } from './elicitation';

export const TESTS_FILE = 'pruebas_traduccion.csv';
const BOM = String.fromCharCode(0xfeff);
const EOL = '\r\n'; // same terminator as the rest of the project's CSVs

function field(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function key(p: TranslationTest): string {
  return `${normalize(p.spanish.trim())}|${normalize(p.expectedDamana.trim())}`;
}

/**
 * Header of pruebas_traduccion.csv. The file is shared data in Spanish, so its
 * columns keep their Spanish names: espanol (Spanish text), damana_esperado
 * (expected Damana) and ambito (scope).
 */
const TESTS_HEADER = 'espanol,damana_esperado,ambito';

/** Reads the tests CSV (Spanish, expected Damana, scope); empty if it does not exist. */
export function readTests(dataDir: string): TranslationTest[] {
  const filePath = path.join(dataDir, TESTS_FILE);
  if (!fs.existsSync(filePath)) return [];
  const rows = parse(fs.readFileSync(filePath), {
    columns: (headers: string[]) =>
      headers.map((h) => ({ espanol: 'spanish', damana_esperado: 'expected_damana', ambito: 'scope' })[h.trim()] ?? h.trim()),
    bom: true,
    skip_empty_lines: true,
  }) as { spanish: string; expected_damana: string; scope: string }[];
  return rows
    .filter((f) => f.spanish && f.expected_damana)
    .map((f) => ({
      spanish: f.spanish,
      expectedDamana: f.expected_damana,
      scope: f.scope || 'otro',
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
): { total: number; added: number } {
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
    TESTS_HEADER,
    ...all.map((p) => [field(p.spanish), field(p.expectedDamana), field(p.scope)].join(',')),
  ];
  fs.writeFileSync(path.join(dataDir, TESTS_FILE), BOM + lines.join(EOL) + EOL, 'utf8');
  return { total: all.length, added: added.length };
}
