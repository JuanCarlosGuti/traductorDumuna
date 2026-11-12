// Mirror of the backend normalizer (backend/src/common/text/normalizer.ts):
// lowercase without accents, preserving ʉ (U+0289) and ñ. Code points
// built numerically so as not to depend on the file's encoding.
const COMBINING_TILDE = String.fromCharCode(0x0303);
const DECOMPOSED_N = 'n' + COMBINING_TILDE;
const ENYE = String.fromCharCode(0x00f1);
const COMBINING_MARKS = new RegExp(
  '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
  'g',
);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .split(DECOMPOSED_N)
    .join(ENYE)
    .replace(COMBINING_MARKS, '');
}
