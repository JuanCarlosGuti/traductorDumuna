/**
 * chrF (Popović 2015) en su forma simple: F-beta sobre n-gramas de
 * caracteres de 1 a N, con precisión y cobertura promediadas sobre los
 * órdenes. Implementación propia, sin dependencias.
 *
 * Preparación del texto: NFC, minúsculas, sin espacios (como el chrF de
 * referencia, que ignora los blancos) y sin puntuación: un punto final de
 * más no debe restar. ʉ y ñ cuentan como caracteres propios: «nunka» y
 * «nʉnka» difieren en un carácter, que es lo que queremos medir.
 */
export const ORDEN_MAXIMO = 6;
export const BETA = 2;

export function prepararTexto(texto: string): string {
  return texto
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']/gu, '');
}

/** Conteo de n-gramas de caracteres de un texto ya preparado. */
export function ngramas(texto: string, n: number): Map<string, number> {
  const conteo = new Map<string, number>();
  for (let i = 0; i + n <= texto.length; i++) {
    const g = texto.slice(i, i + n);
    conteo.set(g, (conteo.get(g) ?? 0) + 1);
  }
  return conteo;
}

function coincidencias(a: Map<string, number>, b: Map<string, number>): number {
  let total = 0;
  for (const [g, na] of a) {
    const nb = b.get(g);
    if (nb !== undefined) total += Math.min(na, nb);
  }
  return total;
}

function sumar(m: Map<string, number>): number {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}

/**
 * chrF entre 0 y 1. Si la referencia y la hipótesis están vacías vale 1;
 * si solo una lo está, 0. Los órdenes para los que la referencia o la
 * hipótesis no tienen n-gramas (textos muy cortos) no cuentan en la
 * media, para no penalizar una respuesta de tres letras por no tener
 * 6-gramas.
 */
export function chrF(
  hipotesis: string,
  referencia: string,
  ordenMaximo = ORDEN_MAXIMO,
  beta = BETA,
): number {
  const h = prepararTexto(hipotesis);
  const r = prepararTexto(referencia);
  if (h.length === 0 && r.length === 0) return 1;
  if (h.length === 0 || r.length === 0) return 0;

  let sumaPrecision = 0;
  let sumaCobertura = 0;
  let ordenes = 0;
  for (let n = 1; n <= ordenMaximo; n++) {
    const gh = ngramas(h, n);
    const gr = ngramas(r, n);
    const totalH = sumar(gh);
    const totalR = sumar(gr);
    if (totalH === 0 || totalR === 0) continue;
    const comunes = coincidencias(gh, gr);
    sumaPrecision += comunes / totalH;
    sumaCobertura += comunes / totalR;
    ordenes++;
  }
  if (ordenes === 0) return 0;
  const precision = sumaPrecision / ordenes;
  const cobertura = sumaCobertura / ordenes;
  if (precision + cobertura === 0) return 0;
  const b2 = beta * beta;
  return ((1 + b2) * precision * cobertura) / (b2 * precision + cobertura);
}
