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
  espanol: string;
  /** Always empty when generated: it is the column the speaker fills in. */
  damana: string;
  motivo: MissingWordReason;
  prioridad: 1 | 2;
  vecesVisto: number;
  fecha: string;
  /** Corpus sentence where the word appears, to give context. */
  ejemploEspanol: string;
  ejemploDamana: string;
}

/** Frequent Damana word the glossary does not translate yet. */
export interface MissingDamanaWordRow {
  damana: string;
  /** Always empty when generated: it is the column the speaker fills in. */
  espanol: string;
  vecesVisto: number;
  ejemploDamana: string;
  ejemploEspanol: string;
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
          espanol: word.toLowerCase(),
          damana: '',
          motivo: reason,
          prioridad: priority,
          vecesVisto: times,
          fecha: date,
          ejemploEspanol: example?.espanol ?? '',
          ejemploDamana: example?.damana ?? '',
        });
        return;
      }
      // Already there: the highest priority wins and usage accumulates.
      previous.vecesVisto += times;
      if (priority < previous.prioridad) {
        previous.prioridad = priority;
        previous.motivo = reason;
      }
      if (date > previous.fecha) previous.fecha = date;
    };

    // Priority 1 — what you asked to translate and the corpus did not back up.
    for (const logEntry of this.translations.listAll()) {
      const support = evaluateSupport({
        puntajeMedio: logEntry.puntajeMedio,
        fuenteTop: logEntry.fuenteTop,
        ejemplosRecuperados: logEntry.ejemplosRecuperados,
        ejemplosEnContexto: logEntry.ejemplosEnContexto,
      });
      if (support.nivel !== 'revisar') continue;
      // The Spanish side: the input if you translated from Spanish, the output otherwise.
      const spanishSide =
        logEntry.direccion === 'espanol_a_damana'
          ? logEntry.texto
          : logEntry.traduccion;
      for (const token of tokenizeDamana(spanishSide)) {
        add(
          token.original,
          'traduccion_con_poco_apoyo',
          1,
          logEntry.creadoEn.slice(0, 10),
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
          a.prioridad - b.prioridad ||
          b.vecesVisto - a.vecesVisto ||
          a.espanol.localeCompare(b.espanol, 'es'),
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
        tokenizeDamana(e.damana).map((t) => t.normalizada),
      ),
    );
    // Conjugated forms already have a gloss in the conjugations table.
    const inConjugations = new Set(
      this.repo.listConjugations().flatMap((c) =>
        tokenizeDamana(c.damana).map((t) => t.normalizada),
      ),
    );
    const examples = this.examplesByDamanaWord();

    return this.repo
      .frequenciesWithOriginals()
      .filter(
        (f) =>
          !inGlossary.has(f.palabra) &&
          !inConjugations.has(f.palabra) &&
          // Probable proper names: they never appear in lowercase.
          f.originales.some((o) => !startsUppercase(o)),
      )
      .slice(0, limit)
      .map((f) => {
        const example = examples.get(f.palabra);
        return {
          damana: f.palabra,
          espanol: '',
          vecesVisto: f.frecuencia,
          ejemploDamana: example?.damana ?? '',
          ejemploEspanol: example?.espanol ?? '',
        };
      });
  }

  /** First reliable sentence where each Spanish word appears. */
  private examplesBySpanishWord(): Map<string, { espanol: string; damana: string }> {
    return this.firstExample((row) => row.textoEspanol);
  }

  /** First reliable sentence where each Damana word appears. */
  private examplesByDamanaWord(): Map<string, { espanol: string; damana: string }> {
    return this.firstExample((row) => row.textoDamana);
  }

  private firstExample(
    side: (row: { textoDamana: string; textoEspanol: string }) => string,
  ): Map<string, { espanol: string; damana: string }> {
    const examples = new Map<string, { espanol: string; damana: string }>();
    for (const source of [CorpusSource.oraciones, CorpusSource.frases]) {
      for (const row of this.repo.textsOf(source)) {
        if (row.estado === 'revisar') continue;
        for (const token of tokenizeDamana(side(row))) {
          if (examples.has(token.normalizada)) continue;
          examples.set(token.normalizada, {
            espanol: row.textoEspanol,
            damana: row.textoDamana,
          });
        }
      }
    }
    return examples;
  }

  private glossaryWords(): Set<string> {
    const covered = new Set<string>();
    for (const entry of this.repo.listVocabulary()) {
      for (const token of tokenizeDamana(entry.espanol)) {
        covered.add(token.normalizada);
      }
    }
    return covered;
  }

  /** Words that appear on the Damana side: written the same, nothing to translate. */
  private wordsInDamana(): Set<string> {
    return new Set(this.repo.frequenciesWithOriginals().map((f) => f.palabra));
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
        if (row.estado === 'revisar') continue; // reliable alignments only
        for (const token of tokenizeDamana(row.textoEspanol)) {
          const entry = info.get(token.normalizada) ?? {
            palabra: token.original.toLowerCase(),
            veces: 0,
            algunaEnMinuscula: false,
          };
          entry.veces++;
          if (!startsUppercase(token.original)) entry.algunaEnMinuscula = true;
          info.set(token.normalizada, entry);
        }
      }
    }
    return [...info.values()]
      .filter((e) => e.algunaEnMinuscula)
      .sort((a, b) => b.veces - a.veces)
      .map((e) => [e.palabra, e.veces]);
  }
}
