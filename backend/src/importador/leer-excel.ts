import * as ExcelJS from 'exceljs';
import { normalizar } from '../comun/texto/normalizador';

/** Una hoja de Excel leída como filas de texto, indexadas por encabezado. */
export interface HojaLeida {
  nombre: string;
  /** Encabezados tal cual aparecen en la fila 1. */
  encabezados: string[];
  /**
   * Cada fila como objeto { encabezadoNormalizado → texto }. Las filas sin
   * ninguna celda con texto se omiten; las vacías entre medias no cortan.
   */
  filas: Record<string, string>[];
}

/**
 * Texto plano de una celda de ExcelJS: cubre texto enriquecido,
 * hipervínculos, fórmulas (su resultado), fechas y números.
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

/** Encabezado comparable: minúsculas, sin tildes, espacios colapsados. */
export function claveEncabezado(encabezado: string): string {
  return normalizar(encabezado).replace(/\s+/g, ' ').trim();
}

/**
 * Lee todas las hojas de un libro. La fila 1 son los encabezados; si una
 * hoja no tiene encabezados (p. ej. una hoja de instrucciones) vuelve con
 * la lista vacía y cero filas.
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
 * Busca en una fila la columna cuyo encabezado contenga alguno de los
 * fragmentos dados (ya normalizados). Permite tolerar variaciones de
 * redacción en las plantillas («qué hace / significado», «significado»).
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
