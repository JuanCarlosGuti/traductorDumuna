import { normalizar } from './normalizador';

export interface TokenDamana {
  original: string;
  normalizada: string;
  posicion: number;
}

/**
 * Tokeniza texto damana: separa por todo lo que no sea letra Unicode,
 * ʉ (U+0289) o apóstrofe. \p{L} ya incluye la ʉ, pero se deja explícita
 * como documentación viva de la regla de dominio. Los apóstrofes solo se
 * conservan si son internos a la palabra (se recortan en los bordes).
 * Signos (¿? , .), dígitos y saltos de línea actúan como separadores.
 */
export function tokenizarDamana(texto: string): TokenDamana[] {
  return texto
    .split(/[^\p{L}ʉ']+/u)
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter((t) => t.length > 0)
    .map((original, posicion) => ({
      original,
      normalizada: normalizar(original),
      posicion,
    }));
}
