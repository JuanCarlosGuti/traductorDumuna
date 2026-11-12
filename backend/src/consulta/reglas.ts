import { normalize } from '../comun/texto/normalizador';
import { isSpanishNegation, isSpanishStopword } from '../comun/texto/stopwords-es';
import { tokenizeDamana } from '../comun/texto/tokenizador';
import { Language } from './consulta.enums';

/**
 * Feature of the input sentence that triggers a grammar rule. It is assigned
 * to each rule on import (based on its «tipo» and its «qué hace») and detected
 * in the sentence with simple heuristics at translation time.
 */
export type Trigger =
  | 'plural'
  | 'posesivo'
  | 'negacion'
  | 'pregunta'
  | 'pasado'
  | 'futuro';

export const TRIGGERS: Trigger[] = [
  'plural',
  'posesivo',
  'negacion',
  'pregunta',
  'pasado',
  'futuro',
];

export interface GrammarRule {
  id: number;
  tipo: string | null;
  forma: string;
  significado: string | null;
  ejemploBase: string | null;
  ejemploRegla: string | null;
  traduccionEjemplo: string | null;
  notas: string | null;
  /** null = general rule: always included. */
  disparador: Trigger | null;
}

/** Cap on rules that travel in the prompt. */
export const MAX_RULES = 8;

/**
 * Infers a rule's trigger from how it was described by whoever
 * filled in the sheet («pluraliza sustantivos», «posesivo / "de"», «negación»…).
 * Both the type AND the meaning are checked: in the template the type is usually just
 * «sufijo», which says nothing about the feature.
 */
export function inferTrigger(
  kind: string | null | undefined,
  meaning: string | null | undefined,
): Trigger | null {
  const text = normalize(`${kind ?? ''} ${meaning ?? ''}`);
  if (/plural/.test(text)) return 'plural';
  if (/poses|pertenen|genitiv|"de"|«de»|'de'/.test(text)) return 'posesivo';
  if (/negac|negativ/.test(text)) return 'negacion';
  if (/pregunt|interrog/.test(text)) return 'pregunta';
  if (/pasado|preterit/.test(text)) return 'pasado';
  if (/futuro/.test(text)) return 'futuro';
  return null;
}

const PLURAL_DETERMINERS = new Set([
  'los', 'las', 'unos', 'unas', 'muchos', 'muchas', 'varios', 'varias',
  'todos', 'todas', 'algunos', 'algunas', 'pocos', 'pocas', 'ambos', 'ambas',
  'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'estos', 'estas', 'esos', 'esas', 'aquellos', 'aquellas', 'sus', 'mis', 'tus',
  'nuestros', 'nuestras',
]);

const POSSESSIVES = new Set([
  'mi', 'mis', 'tu', 'tus', 'su', 'sus', 'nuestro', 'nuestra', 'nuestros',
  'nuestras', 'vuestro', 'vuestra', 'vuestros', 'vuestras', 'mio', 'mia',
  'mios', 'mias', 'tuyo', 'tuya', 'tuyos', 'tuyas', 'suyo', 'suya', 'suyos',
  'suyas', 'de', 'del',
]);

const INTERROGATIVES = new Set([
  'que', 'quien', 'quienes', 'donde', 'adonde', 'cuando', 'como', 'cual',
  'cuales', 'cuanto', 'cuanta', 'cuantos', 'cuantas', 'por',
]);

const PAST_MARKERS = new Set([
  'ayer', 'anoche', 'antier', 'anteayer', 'antes', 'hace',
  'fue', 'fui', 'fueron', 'fuimos', 'era', 'eran', 'eras', 'eramos',
  'tuvo', 'tuve', 'tuvieron', 'tuvimos', 'hizo', 'hice', 'hicieron', 'hicimos',
  'vino', 'vine', 'vinieron', 'vinimos', 'dijo', 'dije', 'dijeron', 'dijimos',
  'pudo', 'pude', 'pudieron', 'puso', 'puse', 'pusieron', 'quiso', 'quise',
  'supo', 'supe', 'estuvo', 'estuve', 'estuvieron', 'estaba', 'estaban',
  'habia', 'habian', 'hubo', 'trajo', 'traje', 'dio', 'di', 'dieron', 'vio', 'vi',
]);

const FUTURE_MARKERS = new Set([
  'manana', 'luego', 'despues', 'pronto', 'proximo', 'proxima', 'proximos',
  'proximas', 'sera', 'seran', 'sere', 'seremos', 'habra', 'tendra', 'tendre',
  'ira', 'iran', 'ire', 'iremos', 'vendra', 'vendre', 'hara', 'hare', 'haremos',
]);

const RE_REGULAR_PAST = /(aron|ieron|aste|iste|aban|abas|aba|ian|ias|imos)$/;
const RE_REGULAR_FUTURE = /(remos|reis|aras|eras|iras|aran|eran|iran)$/;
const RE_FUTURE_PERIPHRASIS = /\b(voy|vas|va|vamos|van)\s+a\b/;

/**
 * Which grammatical features a Spanish sentence carries. These are deliberately
 * simple heuristics: a false positive only adds one extra rule
 * to the prompt (the model decides whether to apply it); a false negative leaves the
 * model without the hint.
 */
export function detectSpanishTriggers(text: string): Trigger[] {
  const tokens = tokenizeDamana(text);
  const normalizedTokens = tokens.map((t) => t.normalizada);
  const originals = tokens.map((t) => t.original);
  const found = new Set<Trigger>();

  if (/[¿?]/.test(text) || INTERROGATIVES.has(normalizedTokens[0] ?? '')) {
    found.add('pregunta');
  }
  if (normalizedTokens.some((t) => isSpanishNegation(t))) found.add('negacion');
  if (normalizedTokens.some((t) => POSSESSIVES.has(t))) found.add('posesivo');

  const lexicalPlural = normalizedTokens.some(
    (t) =>
      t.length >= 5 &&
      t.endsWith('s') &&
      !t.endsWith('mos') &&
      !t.endsWith('is') &&
      !isSpanishStopword(t),
  );
  if (normalizedTokens.some((t) => PLURAL_DETERMINERS.has(t)) || lexicalPlural) {
    found.add('plural');
  }

  const past =
    normalizedTokens.some((t) => PAST_MARKERS.has(t)) ||
    normalizedTokens.some((t) => t.length >= 5 && RE_REGULAR_PAST.test(t)) ||
    originals.some((t) => t.length >= 3 && /[óí]$/.test(t.normalize('NFC')));
  if (past) found.add('pasado');

  const future =
    normalizedTokens.some((t) => FUTURE_MARKERS.has(t)) ||
    normalizedTokens.some((t) => t.length >= 5 && RE_REGULAR_FUTURE.test(t)) ||
    originals.some((t) => t.length >= 4 && /r(á|án|é|ás)$/.test(t.normalize('NFC'))) ||
    RE_FUTURE_PERIPHRASIS.test(normalize(text));
  if (future) found.add('futuro');

  return TRIGGERS.filter((d) => found.has(d));
}

/** The form of a rule («-ndzina») as a comparable suffix, without the hyphen. */
function suffixOf(form: string): string {
  return normalize(form).replace(/^-+/, '').trim();
}

/**
 * In Damana there is no need to guess: a rule is triggered when some word
 * of the input ends in its suffix (and has something before it).
 */
export function rulesByDamanaSuffix(
  text: string,
  rules: GrammarRule[],
): GrammarRule[] {
  const tokens = tokenizeDamana(text).map((t) => t.normalizada);
  return rules.filter((rule) => {
    const suffix = suffixOf(rule.forma);
    if (!suffix) return false;
    return tokens.some((t) => t.length > suffix.length && t.endsWith(suffix));
  });
}

export interface RuleSelection {
  disparadores: Trigger[];
  reglas: GrammarRule[];
}

/**
 * Rules that travel in the prompt: the general ones (no trigger) always,
 * plus those triggered by the sentence's features. In Damana they are triggered by
 * suffix; in Spanish by heuristics. Never more than MAX_RULES.
 */
export function selectRules(
  text: string,
  language: Language,
  rules: GrammarRule[],
): RuleSelection {
  let triggers: Trigger[];
  let triggered: GrammarRule[];

  if (language === Language.espanol) {
    triggers = detectSpanishTriggers(text);
    const activeOnes = new Set(triggers);
    triggered = rules.filter((r) => r.disparador !== null && activeOnes.has(r.disparador));
  } else {
    triggered = rulesByDamanaSuffix(text, rules);
    triggers = TRIGGERS.filter((d) => triggered.some((r) => r.disparador === d));
  }

  const general = rules.filter((r) => r.disparador === null);
  const seen = new Set<number>();
  const selection = [...triggered, ...general].filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  return { disparadores: triggers, reglas: selection.slice(0, MAX_RULES) };
}
