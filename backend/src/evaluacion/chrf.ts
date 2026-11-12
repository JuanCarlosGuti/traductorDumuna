/**
 * chrF (Popović 2015) in its simple form: F-beta over character
 * n-grams from 1 to N, with precision and recall averaged over the
 * orders. Own implementation, no dependencies.
 *
 * Text preparation: NFC, lowercase, no spaces (like the reference
 * chrF, which ignores whitespace) and no punctuation: an extra final
 * full stop must not subtract. ʉ and ñ count as characters of their own: «nunka» and
 * «nʉnka» differ by one character, which is what we want to measure.
 */
export const ORDEN_MAXIMO = 6;
export const BETA = 2;

export function prepararTexto(texto: string): string {
  return texto
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']/gu, '');
}

/** Character n-gram count of an already prepared text. */
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
 * chrF between 0 and 1. If both reference and hypothesis are empty it is 1;
 * if only one is, 0. Orders for which the reference or the
 * hypothesis has no n-grams (very short texts) do not count in the
 * average, so as not to penalize a three-letter answer for having no
 * 6-grams.
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
