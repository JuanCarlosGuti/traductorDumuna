import * as ExcelJS from 'exceljs';
import { normalize } from '../common/text/normalizer';

/** An Excel sheet read as text rows, indexed by header. */
export interface ReadSheet {
  nombre: string;
  /** Headers exactly as they appear in row 1. */
  encabezados: string[];
  /**
   * Each row as an object { normalizedHeader → text }. Rows without
   * any cell with text are skipped; empty ones in between do not cut it off.
   */
  filas: Record<string, string>[];
}

/**
 * Plain text of an ExcelJS cell: covers rich text,
 * hyperlinks, formulas (their result), dates and numbers.
 */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text).join('').trim();
    }
    if ('text' in value && value.text !== undefined) {
      return cellText(value.text as ExcelJS.CellValue);
    }
    if ('result' in value && value.result !== undefined) {
      return cellText(value.result as ExcelJS.CellValue);
    }
    if ('error' in value) return '';
  }
  return String(value).trim();
}

/** Comparable header: lowercase, no accents, spaces collapsed. */
export function headerKey(heading: string): string {
  return normalize(heading).replace(/\s+/g, ' ').trim();
}

/**
 * Reads all the sheets of a workbook. Row 1 holds the headers; if a
 * sheet has no headers (e.g. an instructions sheet) it comes back with
 * an empty list and zero rows.
 */
export async function readWorkbook(filePath: string): Promise<ReadSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook.worksheets.map((sheet) => readSheet(sheet));
}

function readSheet(sheet: ExcelJS.Worksheet): ReadSheet {
  const headerRow = sheet.getRow(1);
  const headings: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, column) => {
    headings[column - 1] = cellText(cell.value);
  });
  const keys = headings.map((e) => (e ? headerKey(e) : ''));

  const rows: Record<string, string>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, num) => {
    if (num === 1) return;
    const logEntry: Record<string, string> = {};
    let withText = false;
    keys.forEach((key, i) => {
      if (!key) return;
      const text = cellText(row.getCell(i + 1).value);
      if (text) withText = true;
      logEntry[key] = text;
    });
    if (withText) rows.push(logEntry);
  });

  return { nombre: sheet.name, encabezados: headings.filter(Boolean), filas: rows };
}

/**
 * Finds in a row the column whose header contains any of the
 * given fragments (already normalized). Lets us tolerate wording
 * variations in the templates («qué hace / significado», «significado»).
 */
export function column(
  row: Record<string, string>,
  ...fragments: string[]
): string {
  for (const fragment of fragments) {
    const key = Object.keys(row).find((k) => k.includes(fragment));
    if (key !== undefined) return row[key];
  }
  return '';
}
