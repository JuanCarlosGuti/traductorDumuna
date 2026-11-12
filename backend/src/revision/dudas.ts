import {
  atDistanceOne,
  spellingSkeleton,
  distinguishingRules,
} from '../comun/texto/esqueleto';
import { normalize } from '../comun/texto/normalizador';
import { isSpanishStopword } from '../comun/texto/stopwords-es';
import { tokenizeDamana } from '../comun/texto/tokenizador';
import { spanishAlternatives } from '../consulta/diccionario';

/**
 * Detectors of what is NOT clear in the data, to ask native
 * speakers about it. They are pure functions: they receive lists and return
 * groups. They never fix anything; they only build the questions.
 */

export interface ExampleSentence {
  damana: string;
  espanol: string;
}

export interface LexicalEntry {
  espanol: string;
  damana: string;
  categoria: string | null;
  notas: string | null;
  fuente: string | null;
}

/** A Damana form as it appears in some source. */
export interface SeenForm {
  /** Normalized (lowercase, no accents; ʉ and ñ intact). */
  forma: string;
  /** Times it appears in sentences and phrases. */
  frecuencia: number;
  /** What the vocabulary or the conjugations say it means. */
  significados: string[];
  ejemplo?: ExampleSentence;
}

// ---------------------------------------------------------------------------
// 1. Spelling: the same word written in several ways
// ---------------------------------------------------------------------------

export interface SpellingGroup {
  /** Which alternation separates them: «u / ʉ», «w / u», «ndzina / nyina»… */
  tipo: string;
  /** From most used to least used. */
  formas: SeenForm[];
  total: number;
}

export const MIN_VARIANT_LENGTH = 4;
export const LOOKALIKE_KIND = 'se parecen y significan lo mismo';

const byUsage = (a: SeenForm, b: SeenForm) =>
  b.frecuencia - a.frecuencia || a.forma.localeCompare(b.forma, 'es');

const byTotal = (a: SpellingGroup, b: SpellingGroup) =>
  b.total - a.total || a.formas[0].forma.localeCompare(b.formas[0].forma, 'es');

function group(kind: string, forms: SeenForm[]): SpellingGroup {
  const sortedWords = [...forms].sort(byUsage);
  return { tipo: kind, formas: sortedWords, total: sortedWords.reduce((s, f) => s + f.frecuencia, 0) };
}

/** Forms that differ only by a known spelling alternation. */
export function detectVariants(forms: SeenForm[]): SpellingGroup[] {
  const bySkeleton = new Map<string, Map<string, SeenForm>>();
  for (const f of forms) {
    const key = spellingSkeleton(f.forma);
    if (key.length < MIN_VARIANT_LENGTH) continue;
    const seen = bySkeleton.get(key) ?? new Map<string, SeenForm>();
    if (!seen.has(f.forma)) seen.set(f.forma, f);
    bySkeleton.set(key, seen);
  }
  return [...bySkeleton.values()]
    .filter((seen) => seen.size > 1)
    .map((seen) => {
      const list = [...seen.values()];
      return group(distinguishingRules(list.map((f) => f.forma)).join(' + ') || 'otra', list);
    })
    .sort(byTotal);
}

function contentWords(text: string): Set<string> {
  return new Set(
    tokenizeDamana(text)
      .map((t) => t.normalizada)
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
    .filter((f) => f.significados.length > 0 && f.forma.length >= 6)
    .map((f) => ({
      f,
      clave: spellingSkeleton(f.forma),
      glosa: contentWords(f.significados.join(' ')),
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
  categoria: string | null;
  fuente: string | null;
  notas: string | null;
  /** Times in the corpus if it is a single word; null if it is a phrase. */
  frecuencia: number | null;
}

export interface SynonymGroup {
  espanol: string;
  opciones: DamanaOption[];
}

/**
 * Spanish words for which the vocabulary gives several Damana forms
 * that are NOT the same one with another spelling (those go under «escritura»).
 * They may be real synonyms, different senses or a mistake.
 */
export function detectSynonyms(entries: LexicalEntry[]): SynonymGroup[] {
  const bySpanish = new Map<string, { texto: string; opciones: Map<string, DamanaOption> }>();
  for (const e of entries) {
    for (const alternative of spanishAlternatives(e.espanol)) {
      const key = tokenizeDamana(alternative)
        .map((t) => t.normalizada)
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
          categoria: e.categoria,
          fuente: e.fuente,
          notas: e.notas,
          frecuencia: null,
        });
      }
      bySpanish.set(key, groupEs);
    }
  }
  return [...bySpanish.values()]
    .filter((g) => g.opciones.size > 1)
    .filter((g) => new Set([...g.opciones.keys()].map(spellingSkeleton)).size > 1)
    .map((g) => ({ espanol: g.texto, opciones: [...g.opciones.values()] }))
    .sort((a, b) => a.espanol.localeCompare(b.espanol, 'es'));
}

// ---------------------------------------------------------------------------
// 3. One Damana form with several meanings in Spanish
// ---------------------------------------------------------------------------

export interface SpanishSense {
  /** As written in the source, with its accent if it has one. */
  damana: string;
  espanol: string;
  fuente: string | null;
}

export interface PolysemyGroup {
  clave: string;
  /**
   * The forms in the group are told apart only by the accent (Ako «córtelo» /
   * Akó «lo cortó»). The app strips accents when comparing, so today it
   * treats them as the same word: if the accent marks something, it is a rule.
   */
  soloTilde: boolean;
  sentidos: SpanishSense[];
}

export function detectPolysemy(entries: LexicalEntry[]): PolysemyGroup[] {
  const byDamana = new Map<string, Map<string, SpanishSense>>();
  for (const e of entries) {
    const key = normalize(e.damana.trim()).replace(/\s+/g, ' ');
    if (!key) continue;
    const senses = byDamana.get(key) ?? new Map<string, SpanishSense>();
    const spanishKey = normalize(e.espanol.trim());
    if (!senses.has(spanishKey)) {
      senses.set(spanishKey, {
        damana: e.damana.trim(),
        espanol: e.espanol.trim(),
        fuente: e.fuente,
      });
    }
    byDamana.set(key, senses);
  }
  return [...byDamana.entries()]
    .filter(([, senses]) => senses.size > 1)
    .map(([key, senses]) => {
      const list = [...senses.values()];
      const written = new Set(list.map((s) => s.damana.toLowerCase().normalize('NFC')));
      return { clave: key, soloTilde: written.size > 1, sentidos: list };
    })
    .sort(
      (a, b) => Number(b.soloTilde) - Number(a.soloTilde) || a.clave.localeCompare(b.clave, 'es'),
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
  entrada: LexicalEntry;
  motivos: DoubtReason[];
  /** Concrete help: e.g. which neighbouring row the note seems to belong to. */
  pista: string;
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
    .map((t) => spellingSkeleton(t.normalizada))
    .filter((k) => k.length >= 5 && !isSpanishStopword(k));
}

function noteMentions(noteKeys: string[], entry: LexicalEntry): boolean {
  const own = [...keysOf(entry.damana), ...keysOf(entry.espanol)];
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
    const noteText = (entry.notas ?? '').trim();

    if (normalize(entry.damana.trim()) === normalize(entry.espanol.trim())) {
      reasons.push('igual_que_espanol');
    }
    if (RE_NO_FORM.test(noteText)) reasons.push('sin_forma');
    if (hasSeveralForms(entry.damana)) reasons.push('varias_formas');
    if (RE_UNCLEAR_SPANISH.test(entry.espanol)) reasons.push('espanol_poco_claro');

    const isFromSpeakers = RE_SPEAKERS_SOURCE.test(entry.fuente ?? '');
    if (isFromSpeakers && noteText) {
      const noteKeys = keysOf(noteText).filter((k) => !EXPLANATION_WORDS.has(k));
      if (noteKeys.length > 0 && !noteMentions(noteKeys, entry)) {
        for (let d = 1; d <= NOTE_NEIGHBOURHOOD && !hint; d++) {
          for (const neighbour of [entries[i + d], entries[i - d]]) {
            if (neighbour && noteMentions(noteKeys, neighbour)) {
              hint = `¿La nota será de «${neighbour.espanol} = ${neighbour.damana}»?`;
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

    if (reasons.length > 0) doubtful.push({ entrada: entry, motivos: reasons, pista: hint });
  });
  return doubtful;
}

// ---------------------------------------------------------------------------
// 5. Endings: the grammar that shows in the words
// ---------------------------------------------------------------------------

export interface KnownRoot {
  raiz: string;
  significado: string;
}

export interface TokenCorpus {
  frecuencia: number;
  ejemplo?: ExampleSentence;
}

export interface EndingExample {
  raiz: string;
  significado: string;
  forma: string;
  frecuencia: number;
  ejemplo?: ExampleSentence;
  /**
   * The Spanish sentence mentions the meaning of the base word: a sign
   * that the root really is that word and not a chance resemblance
   * (anzhʉn «sueño» is not the base of anzhʉnga «importante»).
   */
  encaja: boolean;
}

function fitsTheSentence(meaning: string, example?: ExampleSentence): boolean {
  if (!example) return false;
  const words = (text: string) =>
    tokenizeDamana(text)
      .map((t) => t.normalizada)
      .filter((t) => t.length >= 4);
  // From the meaning, content words count; if it only carries
  // function words («Ellos»), those are used.
  const all = words(meaning);
  const content = all.filter((t) => !isSpanishStopword(t));
  const inSentence = new Set(words(example.espanol).map((t) => t.slice(0, 4)));
  return (content.length > 0 ? content : all).some((t) => inSentence.has(t.slice(0, 4)));
}

export interface CandidateEnding {
  terminacion: string;
  /** In how many distinct base words it appears. */
  raices: number;
  /** Rule or dictionary entry that already explains it, if any. */
  yaSabemos: string;
  ejemplos: EndingExample[];
}

export interface EndingsOptions {
  minimoRaices?: number;
  maximo?: number;
  ejemplosPorTerminacion?: number;
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
  const { minimoRaices: minRoots = 6, maximo: maximum = 30, ejemplosPorTerminacion: examplesPerEnding = 3 } = options;
  const uniqueWords = new Map<string, KnownRoot>();
  for (const r of roots) if (r.raiz.length >= 4 && !uniqueWords.has(r.raiz)) uniqueWords.set(r.raiz, r);

  const byEnding = new Map<string, Map<string, EndingExample>>();
  for (const [form, info] of tokens) {
    for (const r of uniqueWords.values()) {
      const extra = form.length - r.raiz.length;
      if (extra < ENDING_LETTERS.minimo || extra > ENDING_LETTERS.maximo) continue;
      if (!form.startsWith(r.raiz)) continue;
      const ending = form.slice(r.raiz.length);
      const byRoot = byEnding.get(ending) ?? new Map<string, EndingExample>();
      const prior = byRoot.get(r.raiz);
      if (!prior || info.frecuencia > prior.frecuencia) {
        byRoot.set(r.raiz, {
          raiz: r.raiz,
          significado: r.significado,
          forma: form,
          frecuencia: info.frecuencia,
          ejemplo: info.ejemplo,
          encaja: fitsTheSentence(r.significado, info.ejemplo),
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
      terminacion: ending,
      raices: byRoot.size,
      yaSabemos: known.get(ending) ?? '',
      ejemplos: [...byRoot.values()]
        .sort((a, b) => Number(b.encaja) - Number(a.encaja) || b.frecuencia - a.frecuencia)
        .slice(0, examplesPerEnding),
    }));
}
