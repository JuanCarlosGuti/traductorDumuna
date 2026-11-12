import * as ExcelJS from 'exceljs';
import { normalizar } from '../comun/texto/normalizador';

/** An Excel sheet read as text rows, indexed by header. */
export interface HojaLeida {
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
export function textoCelda(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'object') {
    if ('richText' in valor && Array.isArray(valor.richText)) {
      return valor.richText.map((r) => r.text).join('').trim();
    }
    if ('text' in valor && valor.text !== undefined) {
      return textoCelda(valor.text as ExcelJS.CellValue);
    }
    if ('result' in valor && valor.result !== undefined) {
      return textoCelda(valor.result as ExcelJS.CellValue);
    }
    if ('error' in valor) return '';
  }
  return String(valor).trim();
}

/** Comparable header: lowercase, no accents, spaces collapsed. */
export function claveEncabezado(encabezado: string): string {
  return normalizar(encabezado).replace(/\s+/g, ' ').trim();
}

/**
 * Reads all the sheets of a workbook. Row 1 holds the headers; if a
 * sheet has no headers (e.g. an instructions sheet) it comes back with
 * an empty list and zero rows.
 */
export async function leerLibro(ruta: string): Promise<HojaLeida[]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(ruta);
  return libro.worksheets.map((hoja) => leerHoja(hoja));
}

function leerHoja(hoja: ExcelJS.Worksheet): HojaLeida {
  const filaEncabezados = hoja.getRow(1);
  const encabezados: string[] = [];
  filaEncabezados.eachCell({ includeEmpty: false }, (celda, columna) => {
    encabezados[columna - 1] = textoCelda(celda.value);
  });
  const claves = encabezados.map((e) => (e ? claveEncabezado(e) : ''));

  const filas: Record<string, string>[] = [];
  hoja.eachRow({ includeEmpty: false }, (fila, numero) => {
    if (numero === 1) return;
    const registro: Record<string, string> = {};
    let conTexto = false;
    claves.forEach((clave, i) => {
      if (!clave) return;
      const texto = textoCelda(fila.getCell(i + 1).value);
      if (texto) conTexto = true;
      registro[clave] = texto;
    });
    if (conTexto) filas.push(registro);
  });

  return { nombre: hoja.name, encabezados: encabezados.filter(Boolean), filas };
}

/**
 * Finds in a row the column whose header contains any of the
 * given fragments (already normalized). Lets us tolerate wording
 * variations in the templates («qué hace / significado», «significado»).
 */
export function columna(
  fila: Record<string, string>,
  ...fragmentos: string[]
): string {
  for (const fragmento of fragmentos) {
    const clave = Object.keys(fila).find((k) => k.includes(fragmento));
    if (clave !== undefined) return fila[clave];
  }
  return '';
}
