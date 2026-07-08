// Puntos de código construidos numéricamente para que el comportamiento
// no dependa de la forma (compuesta o descompuesta) en que el editor
// guarde este archivo.
const TILDE_COMBINANTE = String.fromCharCode(0x0303); // ◌̃ combinante
const N_DESCOMPUESTA = 'n' + TILDE_COMBINANTE; // ñ en forma NFD
const ENYE = String.fromCharCode(0x00f1); // ñ precompuesta
const MARCAS_COMBINANTES = new RegExp(
  '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
  'g',
);

/**
 * Normaliza texto para búsqueda e indexación: minúsculas y sin tildes
 * (á→a, é→e, ü→u), preservando las letras plenas del damana y del español:
 *
 * - ʉ (U+0289) no se descompone en NFD, queda intacta. ʉ ≠ u SIEMPRE.
 * - ñ se preserva: NFD la descompone en n + U+0303 (tilde combinante),
 *   así que se recompone antes de eliminar las marcas. ñ ≠ n.
 */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .split(N_DESCOMPUESTA)
    .join(ENYE)
    .replace(MARCAS_COMBINANTES, '');
}
