// Mirror of the backend normalizer (backend/src/common/text/normalizer.ts):
// lowercase without accents, preserving ʉ (U+0289) and ñ. Code points
// built numerically so as not to depend on the file's encoding.
const TILDE_COMBINANTE = String.fromCharCode(0x0303);
const N_DESCOMPUESTA = 'n' + TILDE_COMBINANTE;
const ENYE = String.fromCharCode(0x00f1);
const MARCAS_COMBINANTES = new RegExp(
  '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
  'g',
);

export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .split(N_DESCOMPUESTA)
    .join(ENYE)
    .replace(MARCAS_COMBINANTES, '');
}
