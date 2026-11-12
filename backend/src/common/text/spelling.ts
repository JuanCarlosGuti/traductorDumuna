// Code points built numerically so that behaviour
// does not depend on the source file's encoding.
const U_DIAERESIS = String.fromCharCode(0x00fc); // precomposed ü
const UPPER_U_DIAERESIS = String.fromCharCode(0x00dc); // precomposed Ü
const COMBINING_DIAERESIS = String.fromCharCode(0x0308); // ◌̈
const BARRED_U = String.fromCharCode(0x0289); // ʉ
const BARRED_U_UPPER = String.fromCharCode(0x0244); // Ʉ

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
export function fixDamanaSpelling(text: string): string {
  return text
    .split(U_DIAERESIS).join(BARRED_U)
    .split('u' + COMBINING_DIAERESIS).join(BARRED_U)
    .split(UPPER_U_DIAERESIS).join(BARRED_U_UPPER)
    .split('U' + COMBINING_DIAERESIS).join(BARRED_U_UPPER);
}

/**
 * Spanish words with a legitimate ü that may appear inside a
 * Damana sentence (loanwords, names). An explicit list on purpose: a
 * rule such as «güe/güi is Spanish» would wipe out real Damana
 * forms written with the ü workaround (e.g. bugüi → bugʉi).
 */
const SPANISH_WITH_DIAERESIS = new Set(
  [
    'vergüenza', 'pingüino', 'pingüinos', 'bilingüe', 'bilingües',
    'lingüística', 'lingüístico', 'cigüeña', 'cigüeñas', 'antigüedad',
    'ambigüedad', 'agüero', 'ungüento', 'nicaragüense', 'paragüero',
    'desagüe', 'güero', 'argüir', 'averigüe', 'averigüé', 'averigüen',
    'agüita', 'yegüita', 'halagüeño', 'pedigüeño',
  ].map((p) => p.normalize('NFC')),
);

function isSpanishWithDiaeresis(word: string): boolean {
  return SPANISH_WITH_DIAERESIS.has(word.normalize('NFC').toLowerCase());
}

/**
 * Normalizes Damana handwritten by speakers (elicitation format):
 * ʉ may come as «ü» or as «u+» (and «Ü» / «U+» for Ʉ). The
 * Spanish words with ü in the list are left intact.
 */
export function normalizeWrittenDamana(text: string): string {
  const protectedWords: string[] = [];
  const withMarks = text.replace(/[\p{L}\p{M}]+/gu, (word) => {
    if (!isSpanishWithDiaeresis(word)) return word;
    protectedWords.push(word);
    return `\u0000${protectedWords.length - 1}\u0000`;
  });
  const converted = fixDamanaSpelling(
    withMarks.split('u+').join(BARRED_U).split('U+').join(BARRED_U_UPPER),
  );
  return converted.replace(/\u0000(\d+)\u0000/g, (_, i: string) => protectedWords[Number(i)]);
}
