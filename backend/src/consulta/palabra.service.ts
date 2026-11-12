import { Injectable, NotFoundException } from '@nestjs/common';
import { normalize } from '../comun/texto/normalizador';
import { isSpanishStopword } from '../comun/texto/stopwords-es';
import { tokenizeDamana } from '../comun/texto/tokenizador';
import { SearchService } from './busqueda.service';
import { Language } from './consulta.enums';
import { CorpusRepository } from './corpus.repository';
import {
  WordCardVocabularyEntryDto,
  WordCardDto,
  VerbFormDto,
  CandidateTranslationDto,
} from './dto/consulta.dto';

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
      (sum, f) => sum + f.frecuencia,
      0,
    );
    if (totalFrequency === 0) {
      throw new NotFoundException(
        `La palabra "${token}" no aparece en el corpus damana`,
      );
    }

    const concordances = this.searchService.search({
      q: word,
      idioma: Language.damana,
      limite: MAX_CONCORDANCES,
    }).resultados;

    return {
      palabra: word,
      entradasVocabulario: this.vocabularyEntries(word),
      formasVerbales: this.verbForms(word),
      frecuenciaTotal: totalFrequency,
      frecuenciaPorFuente: frequencyBySource,
      concordancias: concordances,
      traduccionesCandidatas: this.candidateTranslations(word),
    };
  }

  /** Direct translations: vocabulary entries whose Damana side IS the word. */
  private vocabularyEntries(normalizedWord: string): WordCardVocabularyEntryDto[] {
    return this.repo
      .listVocabulary()
      .filter((e) => normalize(e.damana) === normalizedWord)
      .map((e) => ({
        espanol: e.espanol,
        categoria: e.categoria,
        notas: e.notas,
        fuente: e.fuente,
      }));
  }

  /** Conjugations whose Damana form contains the word (exact or inside
   *  a multi-word form), with their gloss and lemma. */
  private verbForms(normalizedWord: string): VerbFormDto[] {
    return this.repo
      .conjugationsWithWord(normalizedWord)
      .map((c) => ({ damana: c.damana, espanol: c.espanol, lema: c.lema }));
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
        if (token.normalizada.length < 2) continue;
        if (isSpanishStopword(token.normalizada)) continue;
        tally.set(token.normalizada, (tally.get(token.normalizada) ?? 0) + 1);
      }
    }
    return [...tally.entries()]
      .map(([word, coocurrencias]) => ({ palabra: word, coocurrencias }))
      .sort(
        (a, b) =>
          b.coocurrencias - a.coocurrencias || a.palabra.localeCompare(b.palabra),
      )
      .slice(0, MAX_CANDIDATES);
  }
}
