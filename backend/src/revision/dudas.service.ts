import { normalize } from '../comun/texto/normalizador';
import { tokenizeDamana } from '../comun/texto/tokenizador';
import { CorpusSource } from '../consulta/consulta.enums';
import { CorpusRepository } from '../consulta/corpus.repository';
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
} from './dudas';

/** Everything worth clarifying with speakers, ready to go into Excel. */
export interface DoubtsReport {
  escritura: SpellingGroup[];
  sinonimos: SynonymGroup[];
  polisemia: PolysemyGroup[];
  dudosas: DoubtfulEntry[];
  terminaciones: CandidateEnding[];
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
      espanol: v.espanol,
      damana: v.damana,
      categoria: v.categoria,
      notas: v.notas,
      fuente: v.fuente,
    }));
    const tokens = this.corpusTokens();
    const forms = this.seenForms(entries, tokens);

    const synonyms = detectSynonyms(entries);
    for (const group of synonyms) {
      for (const option of group.opciones) {
        const parts = tokenizeDamana(option.damana);
        option.frecuencia =
          parts.length === 1 ? (tokens.get(parts[0].normalizada)?.frecuencia ?? 0) : null;
      }
    }

    return {
      escritura: [...detectVariants(forms), ...detectLookalikes(forms)],
      sinonimos: synonyms,
      polisemia: detectPolysemy(entries),
      dudosas: detectDoubtfulEntries(entries),
      terminaciones: detectEndings(
        this.knownRoots(entries),
        tokens,
        this.knownEndings(entries),
      ),
    };
  }

  /** Each word of sentences and phrases with its frequency and a short example sentence. */
  private corpusTokens(): Map<string, TokenCorpus> {
    const tokens = new Map<string, TokenCorpus>();
    for (const source of [CorpusSource.oraciones, CorpusSource.frases]) {
      for (const row of this.repo.textsOf(source)) {
        const worksAsExample =
          row.estado !== 'revisar' &&
          row.textoEspanol.trim().length > 0 &&
          row.textoDamana.length <= MAX_EXAMPLE_LENGTH;
        for (const t of tokenizeDamana(row.textoDamana)) {
          const info = tokens.get(t.normalizada) ?? { frecuencia: 0 };
          info.frecuencia++;
          if (
            worksAsExample &&
            (!info.ejemplo || row.textoDamana.length < info.ejemplo.damana.length)
          ) {
            info.ejemplo = { damana: row.textoDamana.trim(), espanol: row.textoEspanol.trim() };
          }
          tokens.set(t.normalizada, info);
        }
      }
    }
    return tokens;
  }

  /** Corpus forms plus those from the vocabulary and the conjugations, with what they mean. */
  private seenForms(entries: LexicalEntry[], tokens: Map<string, TokenCorpus>): SeenForm[] {
    const forms = new Map<string, SeenForm>();
    for (const [form, info] of tokens) {
      forms.set(form, { forma: form, frecuencia: info.frecuencia, significados: [], ejemplo: info.ejemplo });
    }
    const note = (damana: string, spanish: string) => {
      const parts = tokenizeDamana(damana);
      if (parts.length !== 1) return;
      const key = parts[0].normalizada;
      const form = forms.get(key) ?? { forma: key, frecuencia: 0, significados: [] };
      const meaning = spanish.trim();
      if (
        meaning &&
        form.significados.length < MAX_MEANINGS &&
        !form.significados.includes(meaning)
      ) {
        form.significados.push(meaning);
      }
      forms.set(key, form);
    };
    for (const e of entries) note(e.damana, e.espanol);
    for (const c of this.repo.listConjugations()) note(c.damana, c.espanol);
    return [...forms.values()];
  }

  private knownRoots(entries: LexicalEntry[]): KnownRoot[] {
    const roots: KnownRoot[] = [];
    for (const e of entries) {
      const parts = tokenizeDamana(e.damana);
      if (parts.length === 1) {
        roots.push({ raiz: parts[0].normalizada, significado: e.espanol.trim() });
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
        if (parts.length === 1 && !known.has(parts[0].normalizada)) {
          known.set(
            parts[0].normalizada,
            `hay una palabra suelta igual: «${e.espanol.trim()}» (puede no tener relación)`,
          );
        }
      }
    }
    for (const rule of this.repo.listRules()) {
      const key = normalize(rule.forma).replace(/^-+/, '').trim();
      if (key) known.set(key, `regla anotada: ${rule.significado ?? ''}`.trim());
    }
    return known;
  }
}
