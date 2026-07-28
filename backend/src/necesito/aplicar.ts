import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { normalizar } from '../comun/texto/normalizador';
import { corregirOrtografiaDamana } from '../comun/texto/ortografia';
import { resolverDirDatos } from '../importador/rutas-datos';
import { ARCHIVO_DAMANA, ARCHIVO_ESPANOL } from './necesito';

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

/**
 * Lee un Excel de trabajo. Las dos primeras columnas son siempre el par
 * (una la rellena el hablante); `columnaEspanol` dice cuál de ellas es el
 * español, porque el orden se invierte entre los dos archivos.
 */
async function leerExcel(
  ruta: string,
  columnaEspanol: 1 | 2,
): Promise<{ llenadas: FilaLlenada[]; sinLlenar: number }> {
  const llenadas: FilaLlenada[] = [];
  let sinLlenar = 0;
  if (!fs.existsSync(ruta)) return { llenadas, sinLlenar };

  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(ruta);
  const hoja = libro.worksheets[0];
  const columnaDamana = columnaEspanol === 1 ? 2 : 1;

  hoja.eachRow((fila, numero) => {
    if (numero === 1) return; // encabezado
    const espanol = String(fila.getCell(columnaEspanol).value ?? '').trim();
    const damana = String(fila.getCell(columnaDamana).value ?? '').trim();
    if (!espanol && !damana) return;
    if (!espanol || !damana) {
      sinLlenar++;
      return;
    }
    llenadas.push({ espanol, damana });
  });
  return { llenadas, sinLlenar };
}

async function main(): Promise<void> {
  const dirDatos = resolverDirDatos();
  const rutaCsv = path.join(dirDatos, CSV_VOCABULARIO);
  const rutaEspanol = path.join(dirDatos, ARCHIVO_ESPANOL);
  const rutaDamana = path.join(dirDatos, ARCHIVO_DAMANA);

  if (!fs.existsSync(rutaEspanol) && !fs.existsSync(rutaDamana)) {
    console.error(
      `No se encontró ni ${ARCHIVO_ESPANOL} ni ${ARCHIVO_DAMANA} en ${dirDatos}.\n` +
        'Ejecuta antes: npm run necesito',
    );
    process.exit(1);
  }

  // En el archivo español→damana el español va primero; en el otro, segundo.
  const desdeEspanol = await leerExcel(rutaEspanol, 1);
  const desdeDamana = await leerExcel(rutaDamana, 2);
  const llenadas = [...desdeEspanol.llenadas, ...desdeDamana.llenadas];
  const sinLlenar = desdeEspanol.sinLlenar + desdeDamana.sinLlenar;

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
  console.log(
    `Pares completos: ${llenadas.length}  ` +
      `(${desdeEspanol.llenadas.length} de ${ARCHIVO_ESPANOL}, ` +
      `${desdeDamana.llenadas.length} de ${ARCHIVO_DAMANA}; sin llenar: ${sinLlenar})`,
  );
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
