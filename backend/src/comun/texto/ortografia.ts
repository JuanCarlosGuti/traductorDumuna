// Code points built numerically so that behaviour
// does not depend on the source file's encoding.
const U_DIERESIS = String.fromCharCode(0x00fc); // precomposed ü
const U_MAYUS_DIERESIS = String.fromCharCode(0x00dc); // precomposed Ü
const DIERESIS_COMBINANTE = String.fromCharCode(0x0308); // ◌̈
const U_BARRADA = String.fromCharCode(0x0289); // ʉ
const U_BARRADA_MAYUS = String.fromCharCode(0x0244); // Ʉ

/**
 * Fixes spelling artefacts in Damana text on import: some
 * sources (Word documents) write ü/Ü where the Damana alphabet uses
 * ʉ/Ʉ — ü does not exist in Damana, so the conversion is unambiguous.
 * Covers both the precomposed form (U+00FC/U+00DC) and the decomposed one
 * (u/U + combining diaeresis U+0308).
 *
 * Does NOT touch plain u (u and ʉ are different letters and it cannot be guessed)
 * nor typographic quotes «' '» (they are quotation punctuation, not
 * internal apostrophes). It must only be applied to Damana columns — in
 * Spanish ü is legitimate (pingüino).
 */
export function corregirOrtografiaDamana(texto: string): string {
  return texto
    .split(U_DIERESIS).join(U_BARRADA)
    .split('u' + DIERESIS_COMBINANTE).join(U_BARRADA)
    .split(U_MAYUS_DIERESIS).join(U_BARRADA_MAYUS)
    .split('U' + DIERESIS_COMBINANTE).join(U_BARRADA_MAYUS);
}

/**
 * Spanish words with a legitimate ü that may appear inside a
 * Damana sentence (loanwords, names). An explicit list on purpose: a
 * rule such as «güe/güi is Spanish» would wipe out real Damana
 * forms written with the ü workaround (e.g. bugüi → bugʉi).
 */
const ESPANOL_CON_DIERESIS = new Set(
  [
    'vergüenza', 'pingüino', 'pingüinos', 'bilingüe', 'bilingües',
    'lingüística', 'lingüístico', 'cigüeña', 'cigüeñas', 'antigüedad',
    'ambigüedad', 'agüero', 'ungüento', 'nicaragüense', 'paragüero',
    'desagüe', 'güero', 'argüir', 'averigüe', 'averigüé', 'averigüen',
    'agüita', 'yegüita', 'halagüeño', 'pedigüeño',
  ].map((p) => p.normalize('NFC')),
);

function esEspanolConDieresis(palabra: string): boolean {
  return ESPANOL_CON_DIERESIS.has(palabra.normalize('NFC').toLowerCase());
}

/**
 * Normalizes Damana handwritten by speakers (elicitation format):
 * ʉ may come as «ü» or as «u+» (and «Ü» / «U+» for Ʉ). The
 * Spanish words with ü in the list are left intact.
 */
export function normalizarDamanaEscrito(texto: string): string {
  const protegidas: string[] = [];
  const conMarcas = texto.replace(/[\p{L}\p{M}]+/gu, (palabra) => {
    if (!esEspanolConDieresis(palabra)) return palabra;
    protegidas.push(palabra);
    return `\u0000${protegidas.length - 1}\u0000`;
  });
  const convertida = corregirOrtografiaDamana(
    conMarcas.split('u+').join(U_BARRADA).split('U+').join(U_BARRADA_MAYUS),
  );
  return convertida.replace(/\u0000(\d+)\u0000/g, (_, i: string) => protegidas[Number(i)]);
}
