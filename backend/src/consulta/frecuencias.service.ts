import { Injectable } from '@nestjs/common';
import { normalize } from '../comun/texto/normalizador';
import { CorpusRepository } from './corpus.repository';
import { FrequencyDto } from './dto/consulta.dto';

// The capitalization comparison is done in JS and not in SQL because SQLite's
// lower() only handles ASCII (it would fail with Ñ, Ʉ or accented vowels).
function startsLowercase(word: string): boolean {
  const c = word[0] ?? '';
  return c === c.toLowerCase() && c !== c.toUpperCase();
}

@Injectable()
export class FrequenciesService {
  constructor(private readonly repo: CorpusRepository) {}

  /**
   * Damana words by descending frequency, excluding probable
   * proper names (tokens that in the originals only appear with
   * an initial capital). If the word matches a vocabulary
   * entry it carries its translation and category; if it is a conjugated
   * form, its gloss.
   */
  listAll(limit: number): FrequencyDto[] {
    const categories = new Map<string, string>();
    const translations = new Map<string, string>();
    for (const entry of this.repo.listVocabulary()) {
      const key = normalize(entry.damana);
      if (entry.categoria && !categories.has(key)) {
        categories.set(key, entry.categoria);
      }
      if (!translations.has(key)) translations.set(key, entry.espanol);
    }
    // Conjugation glosses as a fallback when there is no vocabulary entry
    for (const conjugation of this.repo.listConjugations()) {
      const key = normalize(conjugation.damana);
      if (!translations.has(key)) translations.set(key, conjugation.espanol);
    }

    return this.repo
      .frequenciesWithOriginals()
      .filter((f) => f.originales.some(startsLowercase))
      .slice(0, limit)
      .map((f) => ({
        palabra: f.palabra,
        frecuencia: f.frecuencia,
        traduccion: translations.get(f.palabra) ?? null,
        categoria: categories.get(f.palabra) ?? null,
      }));
  }
}
