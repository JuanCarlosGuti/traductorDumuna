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
export const MAX_ORDER = 6;
export const BETA = 2;

export function prepareText(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']/gu, '');
}

/** Character n-gram count of an already prepared text. */
export function ngrams(text: string, n: number): Map<string, number> {
  const tally = new Map<string, number>();
  for (let i = 0; i + n <= text.length; i++) {
    const g = text.slice(i, i + n);
    tally.set(g, (tally.get(g) ?? 0) + 1);
  }
  return tally;
}

function matches(a: Map<string, number>, b: Map<string, number>): number {
  let total = 0;
  for (const [g, na] of a) {
    const nb = b.get(g);
    if (nb !== undefined) total += Math.min(na, nb);
  }
  return total;
}

function addUp(m: Map<string, number>): number {
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
  hypothesis: string,
  reference: string,
  maxOrder = MAX_ORDER,
  beta = BETA,
): number {
  const h = prepareText(hypothesis);
  const r = prepareText(reference);
  if (h.length === 0 && r.length === 0) return 1;
  if (h.length === 0 || r.length === 0) return 0;

  let precisionSum = 0;
  let recallSum = 0;
  let orders = 0;
  for (let n = 1; n <= maxOrder; n++) {
    const gh = ngrams(h, n);
    const gr = ngrams(r, n);
    const totalH = addUp(gh);
    const totalR = addUp(gr);
    if (totalH === 0 || totalR === 0) continue;
    const common = matches(gh, gr);
    precisionSum += common / totalH;
    recallSum += common / totalR;
    orders++;
  }
  if (orders === 0) return 0;
  const precision = precisionSum / orders;
  const coverage = recallSum / orders;
  if (precision + coverage === 0) return 0;
  const b2 = beta * beta;
  return ((1 + b2) * precision * coverage) / (b2 * precision + coverage);
}
