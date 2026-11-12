import { normalize } from '../common/text/normalizer';
import { isSpanishNegation, isSpanishStopword } from '../common/text/stopwords-es';
import { tokenizeDamana } from '../common/text/tokenizer';
import { Language } from './query.enums';
import { VocabularyDto } from './dto/query.dto';

/**
 * How the sense was found, from most to least reliable:
 *  - exacta: the word as is (same accent).
 *  - sin_tildes: equal after normalizing (mamá = mama).
 *  - sinonimo: colloquial Spanish variant that the vocabulary records
 *    under another word (mamá → madre).
 *  - singular: removing -s / -es from the input word.
 *  - frase: multi-word entry whose words are all in the sentence.
 *  - posible: they share the first 5 letters (it may be another word).
 */
export type MatchKind =
  | 'exacta'
  | 'sin_tildes'
  | 'sinonimo'
  | 'singular'
  | 'frase'
  | 'posible';

export interface FoundSense {
  /** Word of the input sentence that triggered the lookup. */
  word: string;
  spanish: string;
  damana: string;
  category: string | null;
  notes: string | null;
  match: MatchKind;
}

/** Global cap on senses that travel in the prompt. */
export const MAX_SENSES = 40;
/** Cap on «posible» senses (by prefix) per word. */
export const MAX_POSSIBLE_PER_WORD = 3;
export const PREFIX_LETTERS = 5;

/**
 * Colloquial or affectionate Spanish variants (normalized key) that the
 * vocabulary, built from a dictionary, records under the formal
 * word. It is Spanish synonymy, not an invented translation: the
 * Damana word is the same. A short and obvious list on purpose.
 */
export const SYNONYMS_ES: Record<string, string[]> = {
  mama: ['madre'],
  mami: ['madre'],
  mamita: ['madre'],
  papa: ['padre'],
  papi: ['padre'],
  papito: ['padre'],
  abuelita: ['abuela'],
  abuelito: ['abuelo'],
  hermanita: ['hermana menor', 'hermana'],
  hermanito: ['hermano menor', 'hermano'],
  nena: ['niña'],
  nene: ['niño'],
  chica: ['niña', 'jovencita'],
  chico: ['niño', 'joven'],
  marido: ['esposo'],
  casita: ['casa'],
  perrito: ['perro'],
  perrita: ['perro'],
  gatito: ['gato'],
  aguita: ['agua'],
};

interface Entry {
  spanish: string;
  damana: string;
  category: string | null;
  notes: string | null;
}

interface Phrase {
  /** Verbatim text of the alternative, to show what was recognized. */
  text: string;
  /** Normalized content tokens (without Spanish stopwords). */
  tokens: string[];
  entry: Entry;
}

type Emitter = (word: string, entries: Entry[], match: MatchKind) => void;

/**
 * Variants of the Spanish side of an entry: «Igual, lo mismo» and «Ese o
 * esa» are two senses each; «Cocinera (ave)» is indexed as
 * «cocinera»; «Verb: Hacer» as «hacer». Parentheses are removed because
 * they are clarifications, not part of the word. It splits on «o»/«u» but NOT
 * on «y»: «Madre del agua y peces» is a single thing.
 */
export function spanishAlternatives(spanish: string): string[] {
  return spanish
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^\s*\p{L}+:\s*/u, '')
    .split(/[,;/]|\s[–-]\s|\s[ou]\s/)
    .map((a) => a.replace(/[¿?¡!."]/g, ' ').trim())
    .filter((a) => a.length > 0);
}

/** Singular candidates for a normalized word: flores → flor, casas → casa. */
export function singularCandidates(normalized: string): string[] {
  const candidates: string[] = [];
  if (normalized.length > 4 && normalized.endsWith('es')) {
    candidates.push(normalized.slice(0, -2));
  }
  if (normalized.length > 3 && normalized.endsWith('s')) {
    candidates.push(normalized.slice(0, -1));
  }
  return candidates;
}

/**
 * Vocabulary index used to resolve each word of a sentence. It is
 * built once (≈1,500 entries) and queried on every translation.
 */
export class DictionaryIndex {
  private readonly exactEs = new Map<string, Entry[]>();
  private readonly normalizedEs = new Map<string, Entry[]>();
  private readonly phrasesEs: Phrase[] = [];
  /** Any complete Spanish alternative (one or several words), normalized. */
  private readonly alternativeEs = new Map<string, Entry[]>();
  private readonly normalizedDm = new Map<string, Entry[]>();
  private readonly phrasesDm: Phrase[] = [];
  private readonly keysEs: string[];
  private readonly keysDm: string[];

  constructor(entries: VocabularyDto[]) {
    for (const dto of entries) {
      const entry: Entry = {
        spanish: dto.spanish,
        damana: dto.damana,
        category: dto.category ?? null,
        notes: dto.notes ?? null,
      };
      for (const alternative of spanishAlternatives(dto.spanish)) {
        const tokens = tokenizeDamana(alternative);
        add(this.alternativeEs, tokens.map((t) => t.normalized).join(' '), entry);
        if (tokens.length === 1) {
          add(this.exactEs, tokens[0].original.toLowerCase().normalize('NFC'), entry);
          add(this.normalizedEs, tokens[0].normalized, entry);
        } else if (tokens.length > 1) {
          // Negations are kept as content: «No quiero» must only
          // come in when the sentence carries the «no». If they were removed as
          // stopwords, the negative form would also show up for «quiero» and the
          // model would receive a negated verb for an affirmative sentence.
          const content = tokens
            .map((t) => t.normalized)
            .filter((t) => !isSpanishStopword(t) || isSpanishNegation(t));
          if (content.length > 0) {
            this.phrasesEs.push({ text: alternative, tokens: content, entry: entry });
          }
        }
      }
      const tokensDm = tokenizeDamana(dto.damana);
      if (tokensDm.length === 1) {
        add(this.normalizedDm, tokensDm[0].normalized, entry);
      } else if (tokensDm.length > 1) {
        this.phrasesDm.push({
          text: dto.damana,
          tokens: tokensDm.map((t) => t.normalized),
          entry: entry,
        });
      }
    }
    this.keysEs = [...this.normalizedEs.keys()].sort();
    this.keysDm = [...this.normalizedDm.keys()].sort();
  }

  /**
   * Senses for each word of the text, in text order. For
   * each word it tries the exact string → no accents → singular →
   * prefix, and stops at the first step that finds something. Multi-word
   * entries are included when all their words are in the
   * text.
   */
  search(text: string, language: Language): FoundSense[] {
    const tokens = tokenizeDamana(text);
    const present = new Set(tokens.map((t) => t.normalized));
    const result: FoundSense[] = [];
    const seen = new Set<string>();

    const emit: Emitter = (word, entries, match) => {
      for (const e of entries) {
        const key = `${normalize(e.spanish)}|${normalize(e.damana)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ word: word, match: match, ...e });
      }
    };

    for (const token of tokens) {
      if (language === Language.espanol) {
        this.searchSpanishWord(token.original, token.normalized, emit);
      } else {
        this.searchDamanaWord(token.original, token.normalized, emit);
      }
    }

    const phrases = language === Language.espanol ? this.phrasesEs : this.phrasesDm;
    for (const phrase of phrases) {
      if (phrase.tokens.every((t) => present.has(t))) {
        emit(phrase.text, [phrase.entry], 'frase');
      }
    }

    return result.slice(0, MAX_SENSES);
  }

  private searchSpanishWord(original: string, normalized: string, emit: Emitter): void {
    const exact = this.exactEs.get(original.toLowerCase().normalize('NFC'));
    if (exact) return emit(original, exact, 'exacta');

    const withoutAccents = this.normalizedEs.get(normalized);
    if (withoutAccents) return emit(original, withoutAccents, 'sin_tildes');

    const synonyms = SYNONYMS_ES[normalized];
    if (synonyms) {
      const entries = synonyms.flatMap(
        (s) => this.alternativeEs.get(tokenizeDamana(s).map((t) => t.normalized).join(' ')) ?? [],
      );
      if (entries.length > 0) return emit(original, entries, 'sinonimo');
    }

    // Short function words are not approximated: «las» → «la» would be
    // noise, and by prefix even worse.
    if (isSpanishStopword(normalized) || normalized.length < 4) return;

    for (const singular of singularCandidates(normalized)) {
      const entries = this.normalizedEs.get(singular);
      if (entries) return emit(original, entries, 'singular');
    }

    emit(original, this.byPrefix(normalized, this.keysEs, this.normalizedEs), 'posible');
  }

  private searchDamanaWord(original: string, normalized: string, emit: Emitter): void {
    const exact = this.normalizedDm.get(normalized);
    if (exact) return emit(original, exact, 'exacta');
    if (normalized.length < 4) return;
    emit(original, this.byPrefix(normalized, this.keysDm, this.normalizedDm), 'posible');
  }

  /** Entries whose key shares the first PREFIX_LETTERS letters. */
  private byPrefix(
    normalized: string,
    keys: string[],
    index: Map<string, Entry[]>,
  ): Entry[] {
    if (normalized.length < PREFIX_LETTERS) return [];
    const prefix = normalized.slice(0, PREFIX_LETTERS);
    const foundWords: Entry[] = [];
    for (const key of keys) {
      if (!key.startsWith(prefix)) continue;
      for (const e of index.get(key) ?? []) {
        foundWords.push(e);
        if (foundWords.length >= MAX_POSSIBLE_PER_WORD) return foundWords;
      }
    }
    return foundWords;
  }
}

function add(map: Map<string, Entry[]>, key: string, entry: Entry): void {
  const list = map.get(key);
  if (list) list.push(entry);
  else map.set(key, [entry]);
}
