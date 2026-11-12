import { Injectable } from '@nestjs/common';
import { normalize } from '../common/text/normalizer';
import { isSpanishStopword } from '../common/text/stopwords-es';
import { tokenizeDamana } from '../common/text/tokenizer';
import { CorpusSource } from '../query/query.enums';
import { CorpusRepository } from '../query/corpus.repository';
import { evaluateSupport } from '../translation/support';
import { TranslationsRepository } from '../translation/translations.repository';

export const ROW_CAP = 300;

export type MissingWordReason =
  | 'traduccion_con_poco_apoyo'
  | 'en_corpus_sin_glosario';

export interface MissingWordRow {
  spanish: string;
  /** Always empty when generated: it is the column the speaker fills in. */
  damana: string;
  reason: MissingWordReason;
  priority: 1 | 2;
  timesSeen: number;
  date: string;
  /** Corpus sentence where the word appears, to give context. */
  spanishExample: string;
  damanaExample: string;
}

/** Frequent Damana word the glossary does not translate yet. */
export interface MissingDamanaWordRow {
  damana: string;
  /** Always empty when generated: it is the column the speaker fills in. */
  spanish: string;
  timesSeen: number;
  damanaExample: string;
  spanishExample: string;
}

/**
 * Discards keyboard noise ("zzzz") without being restrictive with Spanish:
 * every Spanish word has at least one vowel.
 */
function looksSpanish(word: string): boolean {
  return word.length >= 3 && /[aeiouáéíóúü]/i.test(word);
}

function startsUppercase(word: string): boolean {
  const c = word[0] ?? '';
  return c !== c.toLowerCase() && c === c.toUpperCase();
}

@Injectable()
export class MissingWordsService {
  constructor(
    private readonly repo: CorpusRepository,
    private readonly translations: TranslationsRepository,
  ) {}

  /**
   * Spanish words the translator is missing, ordered by usefulness:
   * first those that appeared in translations with little support (real use),
   * then those that show up in the corpus but are not in the glossary.
   *
   * Discarded: stopwords, what the glossary already covers, keyboard
   * noise, probable proper names (they only appear with an initial
   * capital) and words that are written the same in Damana.
   */
  compute(today: string, limit = ROW_CAP): MissingWordRow[] {
    const covered = this.glossaryWords();
    const inDamana = this.wordsInDamana();
    const examples = this.examplesBySpanishWord();
    const candidateWords = new Map<string, MissingWordRow>();

    const add = (
      word: string,
      reason: MissingWordReason,
      priority: 1 | 2,
      date: string,
      times: number,
    ): void => {
      const key = normalize(word);
      if (
        isSpanishStopword(key) ||
        covered.has(key) ||
        inDamana.has(key) ||
        !looksSpanish(word)
      ) {
        return;
      }
      const previous = candidateWords.get(key);
      if (!previous) {
        const example = examples.get(key);
        candidateWords.set(key, {
          spanish: word.toLowerCase(),
          damana: '',
          reason: reason,
          priority: priority,
          timesSeen: times,
          date: date,
          spanishExample: example?.spanish ?? '',
          damanaExample: example?.damana ?? '',
        });
        return;
      }
      // Already there: the highest priority wins and usage accumulates.
      previous.timesSeen += times;
      if (priority < previous.priority) {
        previous.priority = priority;
        previous.reason = reason;
      }
      if (date > previous.date) previous.date = date;
    };

    // Priority 1 — what you asked to translate and the corpus did not back up.
    for (const logEntry of this.translations.listAll()) {
      const support = evaluateSupport({
        meanScore: logEntry.meanScore,
        topSource: logEntry.topSource,
        retrievedExamples: logEntry.retrievedExamples,
        examplesInContext: logEntry.examplesInContext,
      });
      if (support.level !== 'revisar') continue;
      // The Spanish side: the input if you translated from Spanish, the output otherwise.
      const spanishSide =
        logEntry.direction === 'espanol_a_damana'
          ? logEntry.text
          : logEntry.translation;
      for (const token of tokenizeDamana(spanishSide)) {
        add(
          token.original,
          'traduccion_con_poco_apoyo',
          1,
          logEntry.createdAt.slice(0, 10),
          1,
        );
      }
    }

    // Priority 2 — corpus vocabulary the glossary does not cover yet.
    for (const [word, times] of this.spanishFrequencies()) {
      add(word, 'en_corpus_sin_glosario', 2, today, times);
    }

    return [...candidateWords.values()]
      .sort(
        (a, b) =>
          a.priority - b.priority ||
          b.timesSeen - a.timesSeen ||
          a.spanish.localeCompare(b.spanish, 'es'),
      )
      .slice(0, limit);
  }

  /**
   * Frequent Damana words the glossary does not translate yet, with a
   * real sentence where they appear. It is the reverse path of `calcular()`:
   * here the speaker provides the meaning in Spanish.
   */
  computeDamana(limit = ROW_CAP): MissingDamanaWordRow[] {
    const inGlossary = new Set(
      this.repo.listVocabulary().flatMap((e) =>
        tokenizeDamana(e.damana).map((t) => t.normalized),
      ),
    );
    // Conjugated forms already have a gloss in the conjugations table.
    const inConjugations = new Set(
      this.repo.listConjugations().flatMap((c) =>
        tokenizeDamana(c.damana).map((t) => t.normalized),
      ),
    );
    const examples = this.examplesByDamanaWord();

    return this.repo
      .frequenciesWithOriginals()
      .filter(
        (f) =>
          !inGlossary.has(f.word) &&
          !inConjugations.has(f.word) &&
          // Probable proper names: they never appear in lowercase.
          f.originals.some((o) => !startsUppercase(o)),
      )
      .slice(0, limit)
      .map((f) => {
        const example = examples.get(f.word);
        return {
          damana: f.word,
          spanish: '',
          timesSeen: f.frequency,
          damanaExample: example?.damana ?? '',
          spanishExample: example?.spanish ?? '',
        };
      });
  }

  /** First reliable sentence where each Spanish word appears. */
  private examplesBySpanishWord(): Map<string, { spanish: string; damana: string }> {
    return this.firstExample((row) => row.spanishText);
  }

  /** First reliable sentence where each Damana word appears. */
  private examplesByDamanaWord(): Map<string, { spanish: string; damana: string }> {
    return this.firstExample((row) => row.damanaText);
  }

  private firstExample(
    side: (row: { damanaText: string; spanishText: string }) => string,
  ): Map<string, { spanish: string; damana: string }> {
    const examples = new Map<string, { spanish: string; damana: string }>();
    for (const source of [CorpusSource.oraciones, CorpusSource.frases]) {
      for (const row of this.repo.textsOf(source)) {
        if (row.status === 'revisar') continue;
        for (const token of tokenizeDamana(side(row))) {
          if (examples.has(token.normalized)) continue;
          examples.set(token.normalized, {
            spanish: row.spanishText,
            damana: row.damanaText,
          });
        }
      }
    }
    return examples;
  }

  private glossaryWords(): Set<string> {
    const covered = new Set<string>();
    for (const entry of this.repo.listVocabulary()) {
      for (const token of tokenizeDamana(entry.spanish)) {
        covered.add(token.normalized);
      }
    }
    return covered;
  }

  /** Words that appear on the Damana side: written the same, nothing to translate. */
  private wordsInDamana(): Set<string> {
    return new Set(this.repo.frequenciesWithOriginals().map((f) => f.word));
  }

  /**
   * Frequency of each Spanish word in the corpus, excluding those that only
   * appear with an initial capital (probable proper names: Jesús, David…).
   */
  private spanishFrequencies(): [string, number][] {
    const info = new Map<
      string,
      { palabra: string; veces: number; algunaEnMinuscula: boolean }
    >();
    const sources = [CorpusSource.oraciones, CorpusSource.frases];
    for (const source of sources) {
      for (const row of this.repo.textsOf(source)) {
        if (row.status === 'revisar') continue; // reliable alignments only
        for (const token of tokenizeDamana(row.spanishText)) {
          const entry = info.get(token.normalized) ?? {
            palabra: token.original.toLowerCase(),
            veces: 0,
            algunaEnMinuscula: false,
          };
          entry.veces++;
          if (!startsUppercase(token.original)) entry.algunaEnMinuscula = true;
          info.set(token.normalized, entry);
        }
      }
    }
    return [...info.values()]
      .filter((e) => e.algunaEnMinuscula)
      .sort((a, b) => b.veces - a.veces)
      .map((e) => [e.palabra, e.veces]);
  }
}
