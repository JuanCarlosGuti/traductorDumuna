import { normalizar } from './normalizador';

const U_BARRADA = String.fromCharCode(0x0289); // ʉ

/** Una alternancia de escritura vista en las fuentes del damana. */
export interface ReglaEscritura {
  nombre: string;
  aplicar: (texto: string) => string;
}

/**
 * Formas distintas de escribir lo que podría ser la misma palabra. Salen
 * de comparar las fuentes entre sí: el folleto escribe «ingui» 786 veces
 * e «ingʉi» 2; el diccionario escribe «Dugwa» y las listas de las
 * hablantes «dugua»; unas fuentes ponen «-ndzina» y otras «-nyina».
 *
 * El orden importa: «ndz» → «ny» va antes que «y» → «i».
 */
export const REGLAS_ESCRITURA: ReglaEscritura[] = [
  { nombre: 'u / ʉ', aplicar: (s) => s.split(U_BARRADA).join('u') },
  { nombre: 'ndzina / nyina', aplicar: (s) => s.replace(/ndz/g, 'ny') },
  { nombre: 'w / u', aplicar: (s) => s.replace(/w/g, 'u') },
  { nombre: 'y / i', aplicar: (s) => s.replace(/y/g, 'i') },
  // La h suelta alterna con j (shihka / shijka); la de sh, zh y ch no.
  { nombre: 'h / j', aplicar: (s) => s.replace(/(?<![szc])h/g, 'j') },
  { nombre: 'c / k', aplicar: (s) => s.replace(/c(?!h)/g, 'k') },
];

/**
 * Clave para DETECTAR posibles variantes de escritura y preguntarle a una
 * hablante cuál es la correcta. Junta a propósito cosas que el resto de
 * la app mantiene separadas (ʉ y u son letras distintas SIEMPRE): por eso
 * no debe usarse para buscar, indexar ni corregir datos, solo para armar
 * la lista de dudas. La ñ se conserva: ñingui y ningui no se juntan.
 */
export function esqueletoOrtografico(texto: string): string {
  return REGLAS_ESCRITURA.reduce((s, regla) => regla.aplicar(s), normalizar(texto));
}

/** Qué alternancias explican que estas formas se escriban distinto. */
export function reglasQueDistinguen(formas: string[]): string[] {
  const base = formas.map((f) => normalizar(f));
  const distintas = new Set(base).size;
  return REGLAS_ESCRITURA.filter(
    (regla) => new Set(base.map((f) => regla.aplicar(f))).size < distintas,
  ).map((regla) => regla.nombre);
}

/** ¿Se diferencian en una sola letra (cambiada, de más o de menos)? */
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
