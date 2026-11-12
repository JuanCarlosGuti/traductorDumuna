import { normalizar } from './normalizador';

const U_BARRADA = String.fromCharCode(0x0289); // ʉ

/** A spelling alternation seen in the Damana sources. */
export interface ReglaEscritura {
  nombre: string;
  aplicar: (texto: string) => string;
}

/**
 * Different ways of writing what could be the same word. They come
 * from comparing the sources with each other: the booklet writes «ingui» 786 times
 * and «ingʉi» 2; the dictionary writes «Dugwa» and the speakers'
 * lists «dugua»; some sources use «-ndzina» and others «-nyina».
 *
 * Order matters: «ndz» → «ny» goes before «y» → «i».
 */
export const REGLAS_ESCRITURA: ReglaEscritura[] = [
  { nombre: 'u / ʉ', aplicar: (s) => s.split(U_BARRADA).join('u') },
  { nombre: 'ndzina / nyina', aplicar: (s) => s.replace(/ndz/g, 'ny') },
  { nombre: 'w / u', aplicar: (s) => s.replace(/w/g, 'u') },
  { nombre: 'y / i', aplicar: (s) => s.replace(/y/g, 'i') },
  // A lone h alternates with j (shihka / shijka); the one in sh, zh and ch does not.
  { nombre: 'h / j', aplicar: (s) => s.replace(/(?<![szc])h/g, 'j') },
  { nombre: 'c / k', aplicar: (s) => s.replace(/c(?!h)/g, 'k') },
];

/**
 * Key for DETECTING possible spelling variants and asking a
 * speaker which one is correct. It deliberately merges things the rest of
 * the app keeps apart (ʉ and u are ALWAYS different letters): that is why
 * it must not be used to search, index or fix data, only to build
 * the list of doubts. The ñ is kept: ñingui and ningui are not merged.
 */
export function esqueletoOrtografico(texto: string): string {
  return REGLAS_ESCRITURA.reduce((s, regla) => regla.aplicar(s), normalizar(texto));
}

/** Which alternations explain why these forms are written differently. */
export function reglasQueDistinguen(formas: string[]): string[] {
  const base = formas.map((f) => normalizar(f));
  const distintas = new Set(base).size;
  return REGLAS_ESCRITURA.filter(
    (regla) => new Set(base.map((f) => regla.aplicar(f))).size < distintas,
  ).map((regla) => regla.nombre);
}

/** Do they differ by a single letter (changed, extra or missing)? */
export function aDistanciaUno(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let inicio = 0;
  while (inicio < a.length && inicio < b.length && a[inicio] === b[inicio]) inicio++;
  let finA = a.length - 1;
  let finB = b.length - 1;
  while (finA >= inicio && finB >= inicio && a[finA] === b[finB]) {
    finA--;
    finB--;
  }
  return Math.max(finA - inicio + 1, finB - inicio + 1) <= 1;
}
