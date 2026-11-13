import { normalize } from '../common/text/normalizer';
import { tokenizeDamana } from '../common/text/tokenizer';
import { CorpusSource } from '../query/query.enums';
import { CorpusRepository } from '../query/corpus.repository';
import {
  detectDoubtfulEntries,
  detectLookalikes,
  detectPolysemy,
  detectSynonyms,
  detectEndings,
  detectVariants,
  DoubtfulEntry,
  LexicalEntry,
  SeenForm,
  SpellingGroup,
  PolysemyGroup,
  SynonymGroup,
  KnownRoot,
  CandidateEnding,
  TokenCorpus,
} from './doubts';

/** Everything worth clarifying with speakers, ready to go into Excel. */
export interface DoubtsReport {
  spelling: SpellingGroup[];
  synonyms: SynonymGroup[];
  polysemy: PolysemyGroup[];
  doubtful: DoubtfulEntry[];
  endings: CandidateEnding[];
}

/** Example sentences are chosen short so they fit in a cell. */
const MAX_EXAMPLE_LENGTH = 160;
const MAX_MEANINGS = 3;

/**
 * Walks the imported corpus and builds the doubts report. Read-only: it does not
 * fix or delete anything. The speakers' answers are applied
 * later, by hand or with a step of their own, when they come back.
 */
export class DoubtsService {
  constructor(private readonly repo: CorpusRepository) {}

  generate(): DoubtsReport {
    const entries: LexicalEntry[] = this.repo.listVocabulary().map((v) => ({
      spanish: v.spanish,
      damana: v.damana,
      category: v.category,
      notes: v.notes,
      source: v.source,
    }));
    const tokens = this.corpusTokens();
    const forms = this.seenForms(entries, tokens);

    const synonyms = detectSynonyms(entries);
    for (const group of synonyms) {
      for (const option of group.options) {
        const parts = tokenizeDamana(option.damana);
        option.frequency =
          parts.length === 1 ? (tokens.get(parts[0].normalized)?.frequency ?? 0) : null;
      }
    }

    return {
      spelling: [...detectVariants(forms), ...detectLookalikes(forms)],
      synonyms: synonyms,
      polysemy: detectPolysemy(entries),
      doubtful: detectDoubtfulEntries(entries),
      endings: detectEndings(
        this.knownRoots(entries),
        tokens,
        this.knownEndings(entries),
      ),
    };
  }

  /** Each word of sentences and phrases with its frequency and a short example sentence. */
  private corpusTokens(): Map<string, TokenCorpus> {
    const tokens = new Map<string, TokenCorpus>();
    for (const source of [CorpusSource.sentences, CorpusSource.phrases]) {
      for (const row of this.repo.textsOf(source)) {
        const worksAsExample =
          row.status !== 'review' &&
          row.spanishText.trim().length > 0 &&
          row.damanaText.length <= MAX_EXAMPLE_LENGTH;
        for (const t of tokenizeDamana(row.damanaText)) {
          const info = tokens.get(t.normalized) ?? { frequency: 0 };
          info.frequency++;
          if (
            worksAsExample &&
            (!info.example || row.damanaText.length < info.example.damana.length)
          ) {
            info.example = { damana: row.damanaText.trim(), spanish: row.spanishText.trim() };
          }
          tokens.set(t.normalized, info);
        }
      }
    }
    return tokens;
  }

  /** Corpus forms plus those from the vocabulary and the conjugations, with what they mean. */
  private seenForms(entries: LexicalEntry[], tokens: Map<string, TokenCorpus>): SeenForm[] {
    const forms = new Map<string, SeenForm>();
    for (const [form, info] of tokens) {
      forms.set(form, { form: form, frequency: info.frequency, meanings: [], example: info.example });
    }
    const note = (damana: string, spanish: string) => {
      const parts = tokenizeDamana(damana);
      if (parts.length !== 1) return;
      const key = parts[0].normalized;
      const form = forms.get(key) ?? { form: key, frequency: 0, meanings: [] };
      const meaning = spanish.trim();
      if (
        meaning &&
        form.meanings.length < MAX_MEANINGS &&
        !form.meanings.includes(meaning)
      ) {
        form.meanings.push(meaning);
      }
      forms.set(key, form);
    };
    for (const e of entries) note(e.damana, e.spanish);
    for (const c of this.repo.listConjugations()) note(c.damana, c.spanish);
    return [...forms.values()];
  }

  private knownRoots(entries: LexicalEntry[]): KnownRoot[] {
    const roots: KnownRoot[] = [];
    for (const e of entries) {
      const parts = tokenizeDamana(e.damana);
      if (parts.length === 1) {
        roots.push({ root: parts[0].normalized, meaning: e.spanish.trim() });
      }
    }
    return roots;
  }

  /** What we already know about an ending: a rule, or an entry that is that particle. */
  private knownEndings(entries: LexicalEntry[]): Map<string, string> {
    const known = new Map<string, string>();
    for (const e of entries) {
      for (const alternative of e.damana.split('/')) {
        const parts = tokenizeDamana(alternative);
        if (parts.length === 1 && !known.has(parts[0].normalized)) {
          known.set(
            parts[0].normalized,
            `hay una palabra suelta igual: «${e.spanish.trim()}» (puede no tener relación)`,
          );
        }
      }
    }
    for (const rule of this.repo.listRules()) {
      const key = normalize(rule.form).replace(/^-+/, '').trim();
      if (key) known.set(key, `regla anotada: ${rule.meaning ?? ''}`.trim());
    }
    return known;
  }
}
