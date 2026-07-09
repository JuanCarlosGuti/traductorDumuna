// Espejo del normalizador del backend (backend/src/comun/texto/normalizador.ts):
// minúsculas sin tildes, preservando ʉ (U+0289) y ñ. Puntos de código
// construidos numéricamente para no depender del encoding del archivo.
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
