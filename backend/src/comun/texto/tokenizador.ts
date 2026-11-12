import { normalize } from './normalizador';

export interface TokenDamana {
  original: string;
  normalizada: string;
  posicion: number;
}

/**
 * Tokenizes Damana text: splits on anything that is not a Unicode letter,
 * ʉ (U+0289) or an apostrophe. \p{L} already includes ʉ, but it is left explicit
 * as living documentation of the domain rule. Apostrophes are only
 * kept if they are internal to the word (they are trimmed at the edges).
 * Signs (¿? , .), digits and line breaks act as separators.
 */
export function tokenizeDamana(text: string): TokenDamana[] {
  return text
    .split(/[^\p{L}ʉ']+/u)
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter((t) => t.length > 0)
    .map((original, position) => ({
      original,
      normalizada: normalize(original),
      posicion: position,
    }));
}
