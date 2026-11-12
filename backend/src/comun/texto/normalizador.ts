// Code points built numerically so that behaviour
// does not depend on the form (composed or decomposed) in which the editor
// saves this file.
const TILDE_COMBINANTE = String.fromCharCode(0x0303); // combining ◌̃
const N_DESCOMPUESTA = 'n' + TILDE_COMBINANTE; // ñ in NFD form
const ENYE = String.fromCharCode(0x00f1); // precomposed ñ
const MARCAS_COMBINANTES = new RegExp(
  '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
  'g',
);

/**
 * Normalizes text for search and indexing: lowercase and no accents
 * (á→a, é→e, ü→u), preserving the full letters of Damana and Spanish:
 *
 * - ʉ (U+0289) is not decomposed by NFD, it stays intact. ʉ ≠ u ALWAYS.
 * - ñ is preserved: NFD decomposes it into n + U+0303 (combining tilde),
 *   so it is recomposed before the marks are removed. ñ ≠ n.
 */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .split(N_DESCOMPUESTA)
    .join(ENYE)
    .replace(MARCAS_COMBINANTES, '');
}
