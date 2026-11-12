import { Injectable } from '@nestjs/common';
import { normalize } from '../common/text/normalizer';
import { tokenizeDamana } from '../common/text/tokenizer';
import { CorpusDomain, CorpusSource, Language } from './query.enums';
import { CorpusRepository } from './corpus.repository';
import { FoundSense, DictionaryIndex } from './dictionary';
import { ProperNameDto } from './dto/query.dto';
import { Trigger, GrammarRule, selectRules } from './rules';

export const K_FRAGMENTOS = 8;

/**
 * Examples that appear only through verbal kinship (another person of the
 * same lemma) are worth less than a direct match: they are useful, but
 * use a different conjugation from the one that was asked about.
 */
export const LEMMA_WEIGHT = 0.6;

/**
 * Cap on sibling forms added to the query for each detected
 * verb. «tener» has 72 forms: adding them all would drown a three-word
 * query.
 */
export const MAX_SIBLING_FORMS = 8;

/**
 * Pairs whose Damana side is identical to the Spanish one: in the corpus they are
 * biblical references («Génesis 1:27-31; Salmo 115:16.») and loose proper
 * names («Felipe»). They are not language examples — they teach neither lexicon nor
 * structure — so they compete for a slot among the K without contributing anything.
 *
 * They are only excluded from the retrieval index: they stay in the CSV, in the database and
 * in search/concordance.
 */
export function isUntranslatedPair(damana: string, spanish: string): boolean {
  const damanaSide = normalize(damana.trim());
  return damanaSide.length > 0 && damanaSide === normalize(spanish.trim());
}

/** Sentences with doubtful alignment (estado='revisar') take part in
 *  retrieval but with half the similarity score. */
export const REVIEW_WEIGHT = 0.5;

/**
 * Example quotas per domain for the translator prompt. Everyday
 * ones take priority: when there are enough, biblical ones drop to 2 so
 * that the religious register does not drag the translation along.
 */
export const EVERYDAY_QUOTA = 6;
export const GRAMMAR_QUOTA = 4;
export const BIBLICAL_QUOTA = 4;
export const REDUCED_BIBLICAL_QUOTA = 2;
export const ENOUGH_EVERYDAY = 4;
export const MAX_EXAMPLES = 14;
/** Candidates requested from TF-IDF before splitting by domain. */
export const CONTEXT_CANDIDATES = 60;
/** Jaccard of Damana tokens above which two examples are «almost equal». */
export const ALMOST_EQUAL_THRESHOLD = 0.8;

const RETRIEVAL_SOURCES: CorpusSource[] = [
  CorpusSource.oraciones,
  CorpusSource.frases,
  CorpusSource.conjugaciones,
];

export interface CorpusFragment {
  fuente: CorpusSource;
  dominio: CorpusDomain;
  id: number;
  referencia: string;
  damana: string;
  espanol: string;
  /** 1 for reliable fragments; REVIEW_WEIGHT for 'revisar' sentences. */
  peso: number;
}

export interface RetrievedFragment extends CorpusFragment {
  puntaje: number;
  /**
   * Present when the fragment was retrieved thanks to another form of the same
   * verb: it holds the lemma, so we can warn that the conjugation differs.
   */
  porLema?: string;
}

export interface FoundProperName {
  /** How it was written in the input sentence. */
  enTexto: string;
  espanol: string;
  damana: string;
}

/** Everything the translator needs to know from the corpus about a sentence. */
export interface RetrievedContext {
  diccionario: FoundSense[];
  nombresPropios: FoundProperName[];
  disparadores: Trigger[];
  reglas: GrammarRule[];
  ejemplos: RetrievedFragment[];
}

/**
 * Minimal TF-IDF index (own implementation, no dependencies):
 * tf = count of the term in the document, idf = ln(1 + N/(1+df)),
 * similarity = cosine between tf·idf vectors.
 */
class TfIdfIndex {
  private readonly idf = new Map<string, number>();
  private readonly vectors: { pesos: Map<string, number>; norma: number }[] = [];

  constructor(tokensPerDocument: string[][]) {
    const n = tokensPerDocument.length;
    const df = new Map<string, number>();
    for (const tokens of tokensPerDocument) {
      for (const term of new Set(tokens)) {
        df.set(term, (df.get(term) ?? 0) + 1);
      }
    }
    for (const [term, frequency] of df) {
      this.idf.set(term, Math.log(1 + n / (1 + frequency)));
    }
    for (const tokens of tokensPerDocument) {
      const weights = this.vectorize(tokens);
      let sum = 0;
      for (const weight of weights.values()) sum += weight * weight;
      this.vectors.push({ pesos: weights, norma: Math.sqrt(sum) });
    }
  }

  private vectorize(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
    const weights = new Map<string, number>();
    for (const [term, frequency] of tf) {
      const idf = this.idf.get(term);
      if (idf !== undefined) weights.set(term, frequency * idf);
    }
    return weights;
  }

  /** Cosine similarity of the query with each document (0 if they share no terms). */
  similarities(queryTokens: string[]): number[] {
    const queryText = this.vectorize(queryTokens);
    let queryNorm = 0;
    for (const weight of queryText.values()) queryNorm += weight * weight;
    queryNorm = Math.sqrt(queryNorm);
    if (queryNorm === 0) return this.vectors.map(() => 0);

    return this.vectors.map(({ pesos: weights, norma }) => {
      if (norma === 0) return 0;
      let product = 0;
      for (const [term, weight] of queryText) {
        const docWeight = weights.get(term);
        if (docWeight !== undefined) product += weight * docWeight;
      }
      return product / (norma * queryNorm);
    });
  }
}

interface Indexes {
  fragmentos: CorpusFragment[];
  porIdioma: Record<Language, TfIdfIndex>;
  /** Conjugated form (normalized) → lemma it belongs to. */
  lemaDeForma: Map<string, string>;
  /** Lemma → its other forms that DO appear in the corpus. */
  formasDelLema: Map<string, string[]>;
}

const normalizedTokenList = (text: string): string[] =>
  tokenizeDamana(text).map((t) => t.normalizada);

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let intersection = 0;
  for (const x of A) if (B.has(x)) intersection++;
  return intersection / (A.size + B.size - intersection);
}

/**
 * Two examples are «almost equal» when one of the sides matches after
 * normalizing or when the Damana shares almost all the words (the
 * same sentence with one comma of difference). Repeating them only wastes a slot.
 */
export function isAlmostEqual(
  a: { damana: string; espanol: string },
  b: { damana: string; espanol: string },
): boolean {
  if (normalize(a.damana.trim()) === normalize(b.damana.trim())) return true;
  const spanishA = normalize(a.espanol.trim());
  if (spanishA.length > 0 && spanishA === normalize(b.espanol.trim())) return true;
  return jaccard(normalizedTokenList(a.damana), normalizedTokenList(b.damana)) >= ALMOST_EQUAL_THRESHOLD;
}

/**
 * Splits the (already scored) candidates by domain with the prompt's
 * quotas: up to 6 everyday, 4 grammar and 4 biblical — 2 if there are already
 * enough everyday ones — without repeating near-duplicates and never more than 14.
 * Returns everyday ones first, then grammar and finally biblical,
 * each group from highest to lowest similarity.
 */
export function splitByDomain(candidates: RetrievedFragment[]): RetrievedFragment[] {
  const sorted = [...candidates].sort((a, b) => b.puntaje - a.puntaje);
  const unique: RetrievedFragment[] = [];
  for (const candidate of sorted) {
    if (!unique.some((u) => isAlmostEqual(u, candidate))) unique.push(candidate);
  }
  const del = (domain: CorpusDomain, quota: number) =>
    unique.filter((f) => f.dominio === domain).slice(0, quota);

  const everyday = del(CorpusDomain.cotidiano, EVERYDAY_QUOTA);
  const grammar = del(CorpusDomain.gramatica, GRAMMAR_QUOTA);
  const biblicalQuota =
    everyday.length >= ENOUGH_EVERYDAY ? REDUCED_BIBLICAL_QUOTA : BIBLICAL_QUOTA;
  const biblical = del(CorpusDomain.biblico, biblicalQuota);
  return [...everyday, ...grammar, ...biblical].slice(0, MAX_EXAMPLES);
}

@Injectable()
export class RetrievalService {
  private indexes?: Indexes;
  private dictionary?: DictionaryIndex;
  private rules?: GrammarRule[];
  private properNames?: ProperNameDto[];

  constructor(private readonly repo: CorpusRepository) {}

  /**
   * Full context for translating a sentence, in this order: word-by-word
   * dictionary, proper names with their spelling, applicable rules
   * and similarity examples split by domain.
   */
  retrieveContext(text: string, language: Language): RetrievedContext {
    const selection = selectRules(text, language, this.getRules());
    return {
      diccionario: this.getDictionary().search(text, language),
      nombresPropios: this.properNamesIn(text),
      disparadores: selection.disparadores,
      reglas: selection.reglas,
      ejemplos: this.examplesByDomain(text, language),
    };
  }

  /** Similarity examples with per-domain quotas and no near-duplicates. */
  examplesByDomain(text: string, language: Language): RetrievedFragment[] {
    return splitByDomain(this.similar(text, language, CONTEXT_CANDIDATES));
  }

  /**
   * Proper names from the table that appear in the text, under any of
   * their spellings (Spanish, Damana or «other spellings seen»), ignoring
   * accents and capitals.
   */
  properNamesIn(text: string): FoundProperName[] {
    const names = this.getProperNames();
    const found: FoundProperName[] = [];
    const seenItems = new Set<string>();
    for (const token of tokenizeDamana(text)) {
      for (const name of names) {
        const spellings = [name.espanol, name.damana, ...name.otrasGrafias].map(normalize);
        if (!spellings.includes(token.normalizada) || seenItems.has(name.damana)) continue;
        seenItems.add(name.damana);
        found.push({ enTexto: token.original, espanol: name.espanol, damana: name.damana });
      }
    }
    return found;
  }

  /**
   * The K corpus fragments most similar to the text, by TF-IDF over
   * normalized tokens of the given language. Sources: sentences (pairs
   * aligned sentence by sentence), phrases and conjugations. Sentences with
   * estado='revisar' take part with half the score.
   */
  similar(text: string, language: Language, k = K_FRAGMENTOS): RetrievedFragment[] {
    const indexes = this.getIndexes();
    const tokens = normalizedTokenList(text);
    const direct = this.scoreAll(tokens, language, indexes);

    // Second pass: if the query carries verb forms, the search is
    // repeated adding the other persons of the same lemma. Only in Damana,
    // which is where lemmas relate forms.
    const siblings =
      language === Language.damana
        ? this.siblingForms(tokens, indexes)
        : new Map<string, string>();
    if (siblings.size === 0) {
      const directOnly = indexes.fragmentos.map((fragment, i) => ({
        ...fragment,
        puntaje: direct[i],
      }));
      return this.bestOnes(directOnly, k);
    }

    const expanded = this.scoreAll([...tokens, ...siblings.keys()], language, indexes);
    return this.bestOnes(this.merge(direct, expanded, siblings, indexes), k);
  }

  private scoreAll(tokens: string[], language: Language, indexes: Indexes): number[] {
    return indexes.porIdioma[language]
      .similarities(tokens)
      .map((similarity, i) => similarity * indexes.fragmentos[i].peso);
  }

  /**
   * Other forms of the same verb that appear in the query, limited to
   * those that exist in the corpus (the rest would only add noise). Returns
   * form → lemma, to be able to mark where each example came from.
   */
  private siblingForms(tokens: string[], indexes: Indexes): Map<string, string> {
    const siblings = new Map<string, string>();
    const inQuery = new Set(tokens);
    for (const token of tokens) {
      const lemma = indexes.lemaDeForma.get(token);
      if (!lemma) continue;
      const forms = (indexes.formasDelLema.get(lemma) ?? [])
        .filter((f) => !inQuery.has(f))
        .slice(0, MAX_SIBLING_FORMS);
      for (const form of forms) siblings.set(form, lemma);
    }
    return siblings;
  }

  /**
   * Each fragment keeps its best score: the direct one, or the one from the
   * expanded search discounted by LEMMA_WEIGHT. That way a real match
   * always beats a verbal relative.
   *
   * Conjugations are left out of the expansion: measured over 200
   * real queries, they took 55 of the 56 slots gained and pushed
   * sentences out. Bringing the «te lee» row when the question was about «nos
   * lee» teaches nothing — the glossary already goes separately in the prompt —; what
   * helps is seeing the verb inside a sentence.
   */
  private merge(
    direct: number[],
    expanded: number[],
    siblings: Map<string, string>,
    indexes: Indexes,
  ): RetrievedFragment[] {
    return indexes.fragmentos.map((fragment, i) => {
      const lemmaScore =
        fragment.fuente === CorpusSource.conjugaciones ? 0 : expanded[i] * LEMMA_WEIGHT;
      if (lemmaScore > direct[i]) {
        return {
          ...fragment,
          puntaje: lemmaScore,
          porLema: this.lemmaPresentIn(fragment, siblings),
        };
      }
      return { ...fragment, puntaje: direct[i] };
    });
  }

  /** Which sibling verb this fragment contains (for the warning). */
  private lemmaPresentIn(
    fragment: CorpusFragment,
    siblings: Map<string, string>,
  ): string | undefined {
    for (const token of tokenizeDamana(fragment.damana)) {
      const lemma = siblings.get(token.normalizada);
      if (lemma) return lemma;
    }
    return undefined;
  }

  private bestOnes(scored: RetrievedFragment[], k: number): RetrievedFragment[] {
    return scored
      .filter((f) => f.puntaje > 0)
      .sort((a, b) => b.puntaje - a.puntaje)
      .slice(0, k);
  }

  /**
   * Relates each conjugated form to its lemma and vice versa. Only
   * forms that really appear in the corpus are kept: of the 267
   * recorded conjugations, most do not show up in any sentence, and
   * adding them to the queries would be noise.
   */
  private buildLemmaIndex(
    fragments: CorpusFragment[],
  ): Pick<Indexes, 'lemaDeForma' | 'formasDelLema'> {
    const inCorpus = new Set(fragments.flatMap((f) => normalizedTokenList(f.damana)));
    const lemmaOfForm = new Map<string, string>();
    const lemmaForms = new Map<string, string[]>();

    for (const { lema: lemma, damana } of this.repo.formsByLemma()) {
      for (const form of normalizedTokenList(damana)) {
        // The first word is enough: multi-word forms carry the
        // verbal marker at the start (e.g. «nujkunanún nanka»).
        if (!lemmaOfForm.has(form)) lemmaOfForm.set(form, lemma);
        if (!inCorpus.has(form)) continue;
        const forms = lemmaForms.get(lemma) ?? [];
        if (!forms.includes(form)) forms.push(form);
        lemmaForms.set(lemma, forms);
        break;
      }
    }
    return { lemaDeForma: lemmaOfForm, formasDelLema: lemmaForms };
  }

  private getIndexes(): Indexes {
    if (!this.indexes) {
      const fragments: CorpusFragment[] = [];
      for (const source of RETRIEVAL_SOURCES) {
        for (const row of this.repo.textsOf(source)) {
          if (isUntranslatedPair(row.textoDamana, row.textoEspanol)) continue;
          fragments.push({
            fuente: source,
            dominio: row.dominio,
            id: row.id,
            referencia: row.referencia,
            damana: row.textoDamana,
            espanol: row.textoEspanol,
            peso: row.estado === 'revisar' ? REVIEW_WEIGHT : 1,
          });
        }
      }
      this.indexes = {
        fragmentos: fragments,
        porIdioma: {
          [Language.damana]: new TfIdfIndex(fragments.map((f) => normalizedTokenList(f.damana))),
          [Language.espanol]: new TfIdfIndex(fragments.map((f) => normalizedTokenList(f.espanol))),
        },
        ...this.buildLemmaIndex(fragments),
      };
    }
    return this.indexes;
  }

  private getDictionary(): DictionaryIndex {
    if (!this.dictionary) {
      this.dictionary = new DictionaryIndex(this.repo.listVocabulary());
    }
    return this.dictionary;
  }

  private getRules(): GrammarRule[] {
    if (!this.rules) this.rules = this.repo.listRules();
    return this.rules;
  }

  private getProperNames(): ProperNameDto[] {
    if (!this.properNames) this.properNames = this.repo.listProperNames();
    return this.properNames;
  }
}
