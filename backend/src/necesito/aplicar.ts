import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { normalizar } from '../comun/texto/normalizador';
import { corregirOrtografiaDamana } from '../comun/texto/ortografia';
import { resolverDirDatos } from '../importador/rutas-datos';
import { ARCHIVO_SALIDA } from './necesito';

const CSV_VOCABULARIO = 'corpus_vocabulario_v2.csv';
const FUENTE_NUEVA = 'lista automatica';
const BOM = String.fromCharCode(0xfeff);

export interface FilaLlenada {
  espanol: string;
  damana: string;
}

export interface ResultadoAplicar {
  agregadas: FilaLlenada[];
  duplicadas: FilaLlenada[];
  sinLlenar: number;
}

/** Clave de comparación: el par completo, con ʉ ≠ u y ñ ≠ n. */
function clave(espanol: string, damana: string): string {
  return `${normalizar(espanol.trim())}|${normalizar(damana.trim())}`;
}

/**
 * Decide qué filas del Excel son nuevas para el glosario. No modifica nada:
 * devolver el plan permite testearlo y mostrarlo antes de escribir.
 */
export function planificar(
  llenadas: FilaLlenada[],
  vocabularioActual: { espanol: string; damana: string }[],
): Omit<ResultadoAplicar, 'sinLlenar'> {
  const existentes = new Set(vocabularioActual.map((v) => clave(v.espanol, v.damana)));
  const agregadas: FilaLlenada[] = [];
  const duplicadas: FilaLlenada[] = [];

  for (const fila of llenadas) {
    const espanol = fila.espanol.trim();
    // Misma corrección ortográfica que aplica el importador (ü → ʉ).
    const damana = corregirOrtografiaDamana(fila.damana.trim());
    const k = clave(espanol, damana);
    if (existentes.has(k)) {
      duplicadas.push({ espanol, damana });
      continue;
    }
    existentes.add(k); // evita duplicados dentro del propio Excel
    agregadas.push({ espanol, damana });
  }
  return { agregadas, duplicadas };
}

/** Escapa un campo para CSV solo cuando hace falta. */
function campo(valor: string): string {
  return /[",\n\r]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

/**
 * Texto a añadir al final del CSV. Respeta el terminador de línea del
 * archivo: los CSV del proyecto vienen con CRLF y mezclar LF deja registros
 * pegados que csv-parse ya no puede leer.
 */
export function construirLineas(
  agregadas: FilaLlenada[],
  contenidoActual: string,
): string {
  if (agregadas.length === 0) return '';
  const eol = contenidoActual.includes('\r\n') ? '\r\n' : '\n';
  const faltaSaltoFinal =
    contenidoActual.length > 0 && !/\r?\n$/.test(contenidoActual);
  const filas = agregadas
    .map((f) =>
      [campo(f.espanol), campo(f.damana), '', '', campo(FUENTE_NUEVA)].join(','),
    )
    .join(eol);
  return `${faltaSaltoFinal ? eol : ''}${filas}${eol}`;
}

async function main(): Promise<void> {
  const dirDatos = resolverDirDatos();
  const rutaExcel = path.join(dirDatos, ARCHIVO_SALIDA);
  const rutaCsv = path.join(dirDatos, CSV_VOCABULARIO);

  if (!fs.existsSync(rutaExcel)) {
    console.error(`No existe ${rutaExcel}. Ejecuta antes: npm run necesito`);
    process.exit(1);
  }

  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(rutaExcel);
  const hoja = libro.worksheets[0];

  const llenadas: FilaLlenada[] = [];
  let sinLlenar = 0;
  hoja.eachRow((fila, numero) => {
    if (numero === 1) return; // encabezado
    const espanol = String(fila.getCell(1).value ?? '').trim();
    const damana = String(fila.getCell(2).value ?? '').trim();
    if (!espanol) return;
    if (!damana) {
      sinLlenar++;
      return;
    }
    llenadas.push({ espanol, damana });
  });

  const vocabulario = parse(fs.readFileSync(rutaCsv), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
  }) as { espanol: string; damana: string }[];

  const { agregadas, duplicadas } = planificar(llenadas, vocabulario);

  if (agregadas.length > 0) {
    // Se AÑADE al final; nunca se reescriben ni se borran las filas existentes.
    const actual = fs.readFileSync(rutaCsv, 'utf8');
    fs.appendFileSync(rutaCsv, construirLineas(agregadas, actual), 'utf8');
  }

  console.log(`\n=== ${CSV_VOCABULARIO} actualizado ===`);
  console.log(`Filas llenas en el Excel: ${llenadas.length}  (sin llenar: ${sinLlenar})`);
  console.log(`  agregadas al glosario:  ${agregadas.length}`);
  console.log(`  omitidas por duplicadas: ${duplicadas.length}`);
  agregadas.slice(0, 10).forEach((f) => console.log(`    + ${f.espanol} = ${f.damana}`));
  duplicadas.slice(0, 5).forEach((f) => console.log(`    · ya estaba: ${f.espanol} = ${f.damana}`));
  if (agregadas.length > 0) {
    console.log('\nAhora ejecuta: npm run importar   (para que la app las use)');
  }
}

// Solo corre como CLI; al importarlo desde un test no ejecuta nada.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export { BOM };
