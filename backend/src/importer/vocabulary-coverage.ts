import { normalize } from '../common/text/normalizer';
import { tokenizeDamana } from '../common/text/tokenizer';
import { spanishAlternatives, singularCandidates } from '../query/dictionary';

export interface CoverableEntry {
  spanish: string;
  damana: string;
}

/**
 * Which words does the vocabulary already know? Used to avoid asking the
 * speakers (who charge per word) for something the corpus already has: an unfilled
 * elicitation row whose word_es already exists is not recorded as
 * pending, and an open pending item that the vocabulary covers is closed.
 *
 * The comparison uses the same rules the translator uses to find a
 * word in the dictionary: alternatives on the Spanish side («Igual, lo
 * mismo», «Ese o esa», parentheses removed), no accents or capitals, and the
 * singular of the requested word (flores → flor). ʉ ≠ u and ñ ≠ n, as always.
 */
export class VocabularyCoverage {
  private readonly spanish = new Set<string>();
  private readonly damana = new Set<string>();

  constructor(entries: CoverableEntry[]) {
    for (const e of entries) {
      // What goes in parentheses also counts as an alternative:
      // «Territorio (tierra)» covers «tierra».
      const parentheses = [...e.spanish.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
      for (const text of [e.spanish, ...parentheses]) {
        for (const alternative of spanishAlternatives(text)) {
          const key = spanishKey(alternative);
          if (key) this.spanish.add(key);
        }
      }
      const dm = tokenizeDamana(e.damana).map((t) => t.normalized).join(' ');
      if (dm) this.damana.add(dm);
    }
  }

  coversSpanish(word: string): boolean {
    for (const alternative of spanishAlternatives(word)) {
      const key = spanishKey(alternative);
      if (!key) continue;
      if (this.spanish.has(key)) return true;
      // Single words only: «flores» → «flor»; a phrase is not singularized.
      if (!key.includes(' ') && singularCandidates(key).some((s) => this.spanish.has(s))) return true;
    }
    return false;
  }

  coversDamana(word: string): boolean {
    const key = tokenizeDamana(word).map((t) => t.normalized).join(' ');
    return key.length > 0 && this.damana.has(key);
  }

  covers(word: string, language: 'spanish' | 'damana'): boolean {
    return language === 'spanish' ? this.coversSpanish(word) : this.coversDamana(word);
  }
}

function spanishKey(alternative: string): string {
  return normalize(alternative).replace(/\s+/g, ' ').trim();
}
