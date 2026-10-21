import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { normalizar } from '../comun/texto/normalizador';
import { PruebaTraduccion } from './elicitacion';

export const ARCHIVO_PRUEBAS = 'pruebas_traduccion.csv';
const BOM = String.fromCharCode(0xfeff);
const EOL = '\r\n'; // mismo terminador que el resto de CSV del proyecto

function campo(valor: string): string {
  return /[",\n\r]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

function clave(p: PruebaTraduccion): string {
  return `${normalizar(p.espanol.trim())}|${normalizar(p.damanaEsperado.trim())}`;
}

/** Lee el CSV de pruebas (espanol, damana_esperado, ambito); vacío si no existe. */
export function leerPruebas(dirDatos: string): PruebaTraduccion[] {
  const ruta = path.join(dirDatos, ARCHIVO_PRUEBAS);
  if (!fs.existsSync(ruta)) return [];
  const filas = parse(fs.readFileSync(ruta), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
  }) as { espanol: string; damana_esperado: string; ambito: string }[];
  return filas
    .filter((f) => f.espanol && f.damana_esperado)
    .map((f) => ({
      espanol: f.espanol,
      damanaEsperado: f.damana_esperado,
      ambito: f.ambito || 'otro',
    }));
}

/**
 * Funde las pruebas reservadas por el importador con las que ya hubiera
 * en el archivo (p. ej. añadidas a mano) y lo reescribe. Idempotente: la
 * misma pareja español/damana no se repite. Nunca borra filas existentes.
 */
export function escribirPruebas(
  dirDatos: string,
  nuevas: PruebaTraduccion[],
): { total: number; agregadas: number } {
  const existentes = leerPruebas(dirDatos);
  const vistas = new Set(existentes.map(clave));
  const agregadas = nuevas.filter((p) => {
    const k = clave(p);
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
  const todas = [...existentes, ...agregadas];
  const lineas = [
    'espanol,damana_esperado,ambito',
    ...todas.map((p) => [campo(p.espanol), campo(p.damanaEsperado), campo(p.ambito)].join(',')),
  ];
  fs.writeFileSync(path.join(dirDatos, ARCHIVO_PRUEBAS), BOM + lineas.join(EOL) + EOL, 'utf8');
  return { total: todas.length, agregadas: agregadas.length };
}
