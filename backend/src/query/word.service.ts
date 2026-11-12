import { Injectable, NotFoundException } from '@nestjs/common';
import { normalize } from '../common/text/normalizer';
import { isSpanishStopword } from '../common/text/stopwords-es';
import { tokenizeDamana } from '../common/text/tokenizer';
import { SearchService } from './search.service';
import { Language } from './query.enums';
import { CorpusRepository } from './corpus.repository';
import {
  WordCardVocabularyEntryDto,
  WordCardDto,
  VerbFormDto,
  CandidateTranslationDto,
} from './dto/query.dto';

const MAX_CONCORDANCES = 10;
const MAX_CANDIDATES = 10;

@Injectable()
export class WordService {
  constructor(
    private readonly repo: CorpusRepository,
    private readonly searchService: SearchService,
  ) {}

  wordCard(token: string): WordCardDto {
    const word = normalize(token.trim());
    const frequencyBySource = this.repo.frequencyBySource(word);
    const totalFrequency = frequencyBySource.reduce(
      (sum, f) => sum + f.frequency,
      0,
    );
    if (totalFrequency === 0) {
      throw new NotFoundException(
        `La palabra "${token}" no aparece en el corpus damana`,
      );
    }

    const concordances = this.searchService.search({
      q: word,
      language: Language.damana,
      limit: MAX_CONCORDANCES,
    }).results;

    return {
      word: word,
      vocabularyEntries: this.vocabularyEntries(word),
      verbForms: this.verbForms(word),
      totalFrequency: totalFrequency,
      frequencyBySource: frequencyBySource,
      concordances: concordances,
      candidateTranslations: this.candidateTranslations(word),
    };
  }

  /** Direct translations: vocabulary entries whose Damana side IS the word. */
  private vocabularyEntries(normalizedWord: string): WordCardVocabularyEntryDto[] {
    return this.repo
      .listVocabulary()
      .filter((e) => normalize(e.damana) === normalizedWord)
      .map((e) => ({
        spanish: e.spanish,
        category: e.category,
        notes: e.notes,
        source: e.source,
      }));
  }

  /** Conjugations whose Damana form contains the word (exact or inside
   *  a multi-word form), with their gloss and lemma. */
  private verbForms(normalizedWord: string): VerbFormDto[] {
    return this.repo
      .conjugationsWithWord(normalizedWord)
      .map((c) => ({ damana: c.damana, spanish: c.spanish, lemma: c.lemma }));
  }

  /**
   * Simple co-occurrence: counts the Spanish words of all the
   * parallel texts where the token appears, excluding stopwords and
   * single-letter words.
   */
  private candidateTranslations(
    normalizedWord: string,
  ): CandidateTranslationDto[] {
    const tally = new Map<string, number>();
    for (const origin of this.repo.originsOf(normalizedWord)) {
      const spanish = this.repo.spanishTextOf(origin.fuente, origin.id);
      for (const token of tokenizeDamana(spanish)) {
        if (token.normalized.length < 2) continue;
        if (isSpanishStopword(token.normalized)) continue;
        tally.set(token.normalized, (tally.get(token.normalized) ?? 0) + 1);
      }
    }
    return [...tally.entries()]
      .map(([word, coocurrencias]) => ({ word: word, cooccurrences: coocurrencias }))
      .sort(
        (a, b) =>
          b.cooccurrences - a.cooccurrences || a.word.localeCompare(b.word),
      )
      .slice(0, MAX_CANDIDATES);
  }
}
