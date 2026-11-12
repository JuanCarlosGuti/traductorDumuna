import {
  atDistanceOne,
  spellingSkeleton,
  distinguishingRules,
} from '../common/text/skeleton';
import { normalize } from '../common/text/normalizer';
import { isSpanishStopword } from '../common/text/stopwords-es';
import { tokenizeDamana } from '../common/text/tokenizer';
import { spanishAlternatives } from '../query/dictionary';

/**
 * Detectors of what is NOT clear in the data, to ask native
 * speakers about it. They are pure functions: they receive lists and return
 * groups. They never fix anything; they only build the questions.
 */

export interface ExampleSentence {
  damana: string;
  spanish: string;
}

export interface LexicalEntry {
  spanish: string;
  damana: string;
  category: string | null;
  notes: string | null;
  source: string | null;
}

/** A Damana form as it appears in some source. */
export interface SeenForm {
  /** Normalized (lowercase, no accents; ʉ and ñ intact). */
  form: string;
  /** Times it appears in sentences and phrases. */
  frequency: number;
  /** What the vocabulary or the conjugations say it means. */
  meanings: string[];
  example?: ExampleSentence;
}

// ---------------------------------------------------------------------------
// 1. Spelling: the same word written in several ways
// ---------------------------------------------------------------------------

export interface SpellingGroup {
  /** Which alternation separates them: «u / ʉ», «w / u», «ndzina / nyina»… */
  type: string;
  /** From most used to least used. */
  forms: SeenForm[];
  total: number;
}

export const MIN_VARIANT_LENGTH = 4;
export const LOOKALIKE_KIND = 'se parecen y significan lo mismo';

const byUsage = (a: SeenForm, b: SeenForm) =>
  b.frequency - a.frequency || a.form.localeCompare(b.form, 'es');

const byTotal = (a: SpellingGroup, b: SpellingGroup) =>
  b.total - a.total || a.forms[0].form.localeCompare(b.forms[0].form, 'es');

function group(kind: string, forms: SeenForm[]): SpellingGroup {
  const sortedWords = [...forms].sort(byUsage);
  return { type: kind, forms: sortedWords, total: sortedWords.reduce((s, f) => s + f.frequency, 0) };
}

/** Forms that differ only by a known spelling alternation. */
export function detectVariants(forms: SeenForm[]): SpellingGroup[] {
  const bySkeleton = new Map<string, Map<string, SeenForm>>();
  for (const f of forms) {
    const key = spellingSkeleton(f.form);
    if (key.length < MIN_VARIANT_LENGTH) continue;
    const seen = bySkeleton.get(key) ?? new Map<string, SeenForm>();
    if (!seen.has(f.form)) seen.set(f.form, f);
    bySkeleton.set(key, seen);
  }
  return [...bySkeleton.values()]
    .filter((seen) => seen.size > 1)
    .map((seen) => {
      const list = [...seen.values()];
      return group(distinguishingRules(list.map((f) => f.form)).join(' + ') || 'otra', list);
    })
    .sort(byTotal);
}

function contentWords(text: string): Set<string> {
  return new Set(
    tokenizeDamana(text)
      .map((t) => t.normalized)
      .filter((t) => t.length >= 3 && !isSpanishStopword(t)),
  );
}

/**
 * Pairs that differ by one letter AND share a meaning in the
 * vocabulary (kʉmatuna «enojó» / kumatuna «furioso»). Without the shared
 * meaning they would be noise: abisha «calentar» and abishi «hiérvalo» also look
 * alike and are legitimately different forms.
 */
export function detectLookalikes(forms: SeenForm[]): SpellingGroup[] {
  const candidateWords = forms
    .filter((f) => f.meanings.length > 0 && f.form.length >= 6)
    .map((f) => ({
      f,
      clave: spellingSkeleton(f.form),
      glosa: contentWords(f.meanings.join(' ')),
    }));
  const groups: SpellingGroup[] = [];
  for (let i = 0; i < candidateWords.length; i++) {
    for (let j = i + 1; j < candidateWords.length; j++) {
      const a = candidateWords[i];
      const b = candidateWords[j];
      if (a.clave === b.clave || !atDistanceOne(a.clave, b.clave)) continue;
      // If what changes is the first letter it is usually a person prefix
      // (anzhʉngʉma «su hijo» / ranzhʉngʉma «mi hijo»): that is grammar.
      if (a.clave[0] !== b.clave[0]) continue;
      if (![...a.glosa].some((word) => b.glosa.has(word))) continue;
      groups.push(group(LOOKALIKE_KIND, [a.f, b.f]));
    }
  }
  return groups.sort(byTotal);
}

// ---------------------------------------------------------------------------
// 2. One Spanish word with several Damana forms
// ---------------------------------------------------------------------------

export interface DamanaOption {
  damana: string;
  category: string | null;
  source: string | null;
  notes: string | null;
  /** Times in the corpus if it is a single word; null if it is a phrase. */
  frequency: number | null;
}

export interface SynonymGroup {
  spanish: string;
  options: DamanaOption[];
}

/**
 * Spanish words for which the vocabulary gives several Damana forms
 * that are NOT the same one with another spelling (those go under «escritura»).
 * They may be real synonyms, different senses or a mistake.
 */
export function detectSynonyms(entries: LexicalEntry[]): SynonymGroup[] {
  const bySpanish = new Map<string, { texto: string; opciones: Map<string, DamanaOption> }>();
  for (const e of entries) {
    for (const alternative of spanishAlternatives(e.spanish)) {
      const key = tokenizeDamana(alternative)
        .map((t) => t.normalized)
        .join(' ');
      if (!key) continue;
      const groupEs = bySpanish.get(key) ?? {
        texto: alternative.trim(),
        opciones: new Map<string, DamanaOption>(),
      };
      const damanaKey = normalize(e.damana.trim());
      if (!groupEs.opciones.has(damanaKey)) {
        groupEs.opciones.set(damanaKey, {
          damana: e.damana.trim(),
          category: e.category,
          source: e.source,
          notes: e.notes,
          frequency: null,
        });
      }
      bySpanish.set(key, groupEs);
    }
  }
  return [...bySpanish.values()]
    .filter((g) => g.opciones.size > 1)
    .filter((g) => new Set([...g.opciones.keys()].map(spellingSkeleton)).size > 1)
    .map((g) => ({ spanish: g.texto, options: [...g.opciones.values()] }))
    .sort((a, b) => a.spanish.localeCompare(b.spanish, 'es'));
}

// ---------------------------------------------------------------------------
// 3. One Damana form with several meanings in Spanish
// ---------------------------------------------------------------------------

export interface SpanishSense {
  /** As written in the source, with its accent if it has one. */
  damana: string;
  spanish: string;
  source: string | null;
}

export interface PolysemyGroup {
  key: string;
  /**
   * The forms in the group are told apart only by the accent (Ako «córtelo» /
   * Akó «lo cortó»). The app strips accents when comparing, so today it
   * treats them as the same word: if the accent marks something, it is a rule.
   */
  accentOnly: boolean;
  senses: SpanishSense[];
}

export function detectPolysemy(entries: LexicalEntry[]): PolysemyGroup[] {
  const byDamana = new Map<string, Map<string, SpanishSense>>();
  for (const e of entries) {
    const key = normalize(e.damana.trim()).replace(/\s+/g, ' ');
    if (!key) continue;
    const senses = byDamana.get(key) ?? new Map<string, SpanishSense>();
    const spanishKey = normalize(e.spanish.trim());
    if (!senses.has(spanishKey)) {
      senses.set(spanishKey, {
        damana: e.damana.trim(),
        spanish: e.spanish.trim(),
        source: e.source,
      });
    }
    byDamana.set(key, senses);
  }
  return [...byDamana.entries()]
    .filter(([, senses]) => senses.size > 1)
    .map(([key, senses]) => {
      const list = [...senses.values()];
      const written = new Set(list.map((s) => s.damana.toLowerCase().normalize('NFC')));
      return { key: key, accentOnly: written.size > 1, senses: list };
    })
    .sort(
      (a, b) => Number(b.accentOnly) - Number(a.accentOnly) || a.key.localeCompare(b.key, 'es'),
    );
}

// ---------------------------------------------------------------------------
// 4. Entries that must be clarified one by one
// ---------------------------------------------------------------------------

export type DoubtReason =
  | 'igual_que_espanol'
  | 'sin_forma'
  | 'varias_formas'
  | 'nota_de_otra_palabra'
  | 'espanol_poco_claro'
  | 'nota_por_confirmar';

export const REASON_TEXT: Record<DoubtReason, string> = {
  igual_que_espanol:
    'Está escrita igual que en español. ¿Se dice así en damana o hay una palabra propia?',
  sin_forma: 'La nota dice que no hay forma de traducirla. ¿Cómo se diría esa idea?',
  varias_formas:
    'Hay varias formas en la misma casilla. ¿Cuál va con este significado y qué significa cada una?',
  nota_de_otra_palabra: 'La nota parece hablar de otra palabra. ¿Corresponde a esta fila?',
  espanol_poco_claro: 'El significado en español no está claro. ¿Qué quiere decir exactamente?',
  nota_por_confirmar:
    'Tiene una explicación de la hablante. Confirmar que la palabra y la explicación están bien.',
};

export interface DoubtfulEntry {
  entry: LexicalEntry;
  reasons: DoubtReason[];
  /** Concrete help: e.g. which neighbouring row the note seems to belong to. */
  hint: string;
}

const RE_FORM_SEPARATOR = /\/|\s-\s|\p{L}-\p{L}/u;
/** A comma separates forms only in short cells; in a sentence it is punctuation. */
const MAX_WORDS_WITH_COMMA = 4;

function hasSeveralForms(damana: string): boolean {
  if (RE_FORM_SEPARATOR.test(damana)) return true;
  return damana.includes(',') && tokenizeDamana(damana).length <= MAX_WORDS_WITH_COMMA;
}
const RE_NO_FORM = /no hay forma|no tiene forma|no hay palabra/i;
const RE_UNCLEAR_SPANISH = /\(probable\)|^\s*(verb|afi)\s*:/i;
const RE_SPEAKERS_SOURCE = /nativ/i;
/** How many rows away to look for the owner of a shifted note. */
const NOTE_NEIGHBOURHOOD = 2;

/** Words the notes use to explain and that identify no row. */
const EXPLANATION_WORDS = new Set(
  [
    'damana', 'dumuna', 'ejemplo', 'palabra', 'palabras', 'significa', 'quiere', 'decir',
    'refiere', 'varios', 'varias', 'forma', 'traducir', 'traducirlo', 'traduzca', 'texto',
    'citado', 'pasado', 'tambien', 'puede', 'podemos', 'cuando', 'encuentra', 'agrega',
    'agregado', 'nombre', 'nombres', 'propios', 'lugares', 'escribe', 'suele', 'traducirse',
    'realmente', 'frase', 'porque', 'mismo', 'tiempo', 'lugar', 'persona', 'personas',
  ].map(spellingSkeleton),
);

function keysOf(text: string): string[] {
  return tokenizeDamana(text)
    .map((t) => spellingSkeleton(t.normalized))
    .filter((k) => k.length >= 5 && !isSpanishStopword(k));
}

function noteMentions(noteKeys: string[], entry: LexicalEntry): boolean {
  const own = [...keysOf(entry.damana), ...keysOf(entry.spanish)];
  return own.some((p) => noteKeys.some((n) => n === p || atDistanceOne(n, p)));
}

/**
 * Vocabulary entries that need clarification. The order of the list
 * matters: to detect notes shifted to another row the neighbours are checked (in
 * the «nativas 2026-10» block the note for «pastores» ended up on «pedazo»).
 */
export function detectDoubtfulEntries(entries: LexicalEntry[]): DoubtfulEntry[] {
  const doubtful: DoubtfulEntry[] = [];
  entries.forEach((entry, i) => {
    const reasons: DoubtReason[] = [];
    let hint = '';
    const noteText = (entry.notes ?? '').trim();

    if (normalize(entry.damana.trim()) === normalize(entry.spanish.trim())) {
      reasons.push('igual_que_espanol');
    }
    if (RE_NO_FORM.test(noteText)) reasons.push('sin_forma');
    if (hasSeveralForms(entry.damana)) reasons.push('varias_formas');
    if (RE_UNCLEAR_SPANISH.test(entry.spanish)) reasons.push('espanol_poco_claro');

    const isFromSpeakers = RE_SPEAKERS_SOURCE.test(entry.source ?? '');
    if (isFromSpeakers && noteText) {
      const noteKeys = keysOf(noteText).filter((k) => !EXPLANATION_WORDS.has(k));
      if (noteKeys.length > 0 && !noteMentions(noteKeys, entry)) {
        for (let d = 1; d <= NOTE_NEIGHBOURHOOD && !hint; d++) {
          for (const neighbour of [entries[i + d], entries[i - d]]) {
            if (neighbour && noteMentions(noteKeys, neighbour)) {
              hint = `¿La nota será de «${neighbour.spanish} = ${neighbour.damana}»?`;
              break;
            }
          }
        }
        if (hint) reasons.push('nota_de_otra_palabra');
      }
      if (!reasons.includes('nota_de_otra_palabra') && !reasons.includes('sin_forma')) {
        reasons.push('nota_por_confirmar');
      }
    }

    if (reasons.length > 0) doubtful.push({ entry: entry, reasons: reasons, hint: hint });
  });
  return doubtful;
}

// ---------------------------------------------------------------------------
// 5. Endings: the grammar that shows in the words
// ---------------------------------------------------------------------------

export interface KnownRoot {
  root: string;
  meaning: string;
}

export interface TokenCorpus {
  frequency: number;
  example?: ExampleSentence;
}

export interface EndingExample {
  root: string;
  meaning: string;
  form: string;
  frequency: number;
  example?: ExampleSentence;
  /**
   * The Spanish sentence mentions the meaning of the base word: a sign
   * that the root really is that word and not a chance resemblance
   * (anzhʉn «sueño» is not the base of anzhʉnga «importante»).
   */
  fits: boolean;
}

function fitsTheSentence(meaning: string, example?: ExampleSentence): boolean {
  if (!example) return false;
  const words = (text: string) =>
    tokenizeDamana(text)
      .map((t) => t.normalized)
      .filter((t) => t.length >= 4);
  // From the meaning, content words count; if it only carries
  // function words («Ellos»), those are used.
  const all = words(meaning);
  const content = all.filter((t) => !isSpanishStopword(t));
  const inSentence = new Set(words(example.spanish).map((t) => t.slice(0, 4)));
  return (content.length > 0 ? content : all).some((t) => inSentence.has(t.slice(0, 4)));
}

export interface CandidateEnding {
  ending: string;
  /** In how many distinct base words it appears. */
  roots: number;
  /** Rule or dictionary entry that already explains it, if any. */
  alreadyKnown: string;
  examples: EndingExample[];
}

export interface EndingsOptions {
  minRoots?: number;
  maximum?: number;
  examplesPerEnding?: number;
}

export const ENDING_LETTERS = { minimo: 2, maximo: 7 };

/**
 * Endings that repeat after words we already know:
 * urraga «casa» appears as urragamba, urragaka, urraganzhe… If «-mba»
 * shows up after 40 different words it is grammar, not chance, and
 * it is worth asking what it adds.
 */
export function detectEndings(
  roots: KnownRoot[],
  tokens: Map<string, TokenCorpus>,
  known: Map<string, string>,
  options: EndingsOptions = {},
): CandidateEnding[] {
  const { minRoots: minRoots = 6, maximum: maximum = 30, examplesPerEnding: examplesPerEnding = 3 } = options;
  const uniqueWords = new Map<string, KnownRoot>();
  for (const r of roots) if (r.root.length >= 4 && !uniqueWords.has(r.root)) uniqueWords.set(r.root, r);

  const byEnding = new Map<string, Map<string, EndingExample>>();
  for (const [form, info] of tokens) {
    for (const r of uniqueWords.values()) {
      const extra = form.length - r.root.length;
      if (extra < ENDING_LETTERS.minimo || extra > ENDING_LETTERS.maximo) continue;
      if (!form.startsWith(r.root)) continue;
      const ending = form.slice(r.root.length);
      const byRoot = byEnding.get(ending) ?? new Map<string, EndingExample>();
      const prior = byRoot.get(r.root);
      if (!prior || info.frequency > prior.frequency) {
        byRoot.set(r.root, {
          root: r.root,
          meaning: r.meaning,
          form: form,
          frequency: info.frequency,
          example: info.example,
          fits: fitsTheSentence(r.meaning, info.example),
        });
      }
      byEnding.set(ending, byRoot);
    }
  }

  return [...byEnding.entries()]
    .filter(([, byRoot]) => byRoot.size >= minRoots)
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0], 'es'))
    .slice(0, maximum)
    .map(([ending, byRoot]) => ({
      ending: ending,
      roots: byRoot.size,
      alreadyKnown: known.get(ending) ?? '',
      examples: [...byRoot.values()]
        .sort((a, b) => Number(b.fits) - Number(a.fits) || b.frequency - a.frequency)
        .slice(0, examplesPerEnding),
    }));
}
