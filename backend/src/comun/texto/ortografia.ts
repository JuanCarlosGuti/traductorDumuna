// Puntos de código construidos numéricamente para que el comportamiento
// no dependa del encoding del archivo fuente.
const U_DIERESIS = String.fromCharCode(0x00fc); // ü precompuesta
const U_MAYUS_DIERESIS = String.fromCharCode(0x00dc); // Ü precompuesta
const DIERESIS_COMBINANTE = String.fromCharCode(0x0308); // ◌̈
const U_BARRADA = String.fromCharCode(0x0289); // ʉ
const U_BARRADA_MAYUS = String.fromCharCode(0x0244); // Ʉ

/**
 * Corrige artefactos ortográficos en texto damana al importar: algunas
 * fuentes (documentos Word) escriben ü/Ü donde el alfabeto damana usa
 * ʉ/Ʉ — la ü no existe en damana, así que la conversión es inequívoca.
 * Cubre tanto la forma precompuesta (U+00FC/U+00DC) como la descompuesta
 * (u/U + diéresis combinante U+0308).
 *
 * NO toca la u simple (u y ʉ son letras distintas y no se puede adivinar)
 * ni las comillas tipográficas «' '» (son puntuación de citas, no
 * apóstrofes internos). Solo debe aplicarse a columnas damana — en
 * español la ü es legítima (pingüino).
 */
export function corregirOrtografiaDamana(texto: string): string {
  return texto
    .split(U_DIERESIS).join(U_BARRADA)
    .split('u' + DIERESIS_COMBINANTE).join(U_BARRADA)
    .split(U_MAYUS_DIERESIS).join(U_BARRADA_MAYUS)
    .split('U' + DIERESIS_COMBINANTE).join(U_BARRADA_MAYUS);
}
