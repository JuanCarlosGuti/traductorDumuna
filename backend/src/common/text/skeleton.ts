import { normalize } from './normalizer';

const BARRED_U = String.fromCharCode(0x0289); // ʉ

/** A spelling alternation seen in the Damana sources. */
export interface SpellingRule {
  name: string;
  apply: (text: string) => string;
}

/**
 * Different ways of writing what could be the same word. They come
 * from comparing the sources with each other: the booklet writes «ingui» 786 times
 * and «ingʉi» 2; the dictionary writes «Dugwa» and the speakers'
 * lists «dugua»; some sources use «-ndzina» and others «-nyina».
 *
 * Order matters: «ndz» → «ny» goes before «y» → «i».
 */
export const SPELLING_RULES: SpellingRule[] = [
  { name: 'u / ʉ', apply: (s) => s.split(BARRED_U).join('u') },
  { name: 'ndzina / nyina', apply: (s) => s.replace(/ndz/g, 'ny') },
  { name: 'w / u', apply: (s) => s.replace(/w/g, 'u') },
  { name: 'y / i', apply: (s) => s.replace(/y/g, 'i') },
  // A lone h alternates with j (shihka / shijka); the one in sh, zh and ch does not.
  { name: 'h / j', apply: (s) => s.replace(/(?<![szc])h/g, 'j') },
  { name: 'c / k', apply: (s) => s.replace(/c(?!h)/g, 'k') },
];

/**
 * Key for DETECTING possible spelling variants and asking a
 * speaker which one is correct. It deliberately merges things the rest of
 * the app keeps apart (ʉ and u are ALWAYS different letters): that is why
 * it must not be used to search, index or fix data, only to build
 * the list of doubts. The ñ is kept: ñingui and ningui are not merged.
 */
export function spellingSkeleton(text: string): string {
  return SPELLING_RULES.reduce((s, rule) => rule.apply(s), normalize(text));
}

/** Which alternations explain why these forms are written differently. */
export function distinguishingRules(forms: string[]): string[] {
  const base = forms.map((f) => normalize(f));
  const distinct = new Set(base).size;
  return SPELLING_RULES.filter(
    (rule) => new Set(base.map((f) => rule.apply(f))).size < distinct,
  ).map((rule) => rule.name);
}

/** Do they differ by a single letter (changed, extra or missing)? */
export function atDistanceOne(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }
  return Math.max(endA - start + 1, endB - start + 1) <= 1;
}
