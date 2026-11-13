import { CorpusDomain } from '../query/query.enums';
import { Trigger } from '../query/rules';
import { RetrievedContext, RetrievedFragment } from '../query/retrieval.service';
import { TranslationDirection } from './dto/translation.dto';

/** Names of the keys of each gloss pair depending on the direction. */
export function glossKeys(direction: TranslationDirection): { origin: string; target: string } {
  return direction === TranslationDirection.spanish_to_damana
    ? { origin: 'word_es', target: 'segment_dm' }
    : { origin: 'word_dm', target: 'segment_es' };
}

/** JSON Schema of the response: used by Anthropic's structured output. */
export function responseSchema(direction: TranslationDirection): Record<string, unknown> {
  const { origin, target } = glossKeys(direction);
  return {
    type: 'object',
    properties: {
      translation: { type: 'string' },
      gloss: {
        type: 'array',
        items: {
          type: 'object',
          properties: { [origin]: { type: 'string' }, [target]: { type: 'string' } },
          required: [origin, target],
          additionalProperties: false,
        },
      },
      words_without_equivalent: { type: 'array', items: { type: 'string' } },
      applied_rules: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number' },
      brief_explanation: { type: 'string' },
    },
    required: [
      'translation',
      'gloss',
      'words_without_equivalent',
      'applied_rules',
      'confidence',
      'brief_explanation',
    ],
    additionalProperties: false,
  };
}

export function buildSystemPrompt(direction: TranslationDirection): string {
  const { origin, target } = glossKeys(direction);
  return (
    'You are an expert translator between Damana (dʉmʉna), the language of the Wiwa ' +
    'people of the Sierra Nevada de Santa Marta (Colombia), and Spanish. In Damana ' +
    'the vowel ʉ (U+0289) is a full letter distinct from u, and ñ is also a full ' +
    'letter: copy them as they are, never replace them.\n\n' +
    'You will receive a message with fixed sections: GRAMMAR RULES, DICTIONARY FOR ' +
    'THIS SENTENCE, EVERYDAY EXAMPLES, GRAMMAR EXAMPLES, BIBLICAL CORPUS EXAMPLES ' +
    'and SENTENCE TO TRANSLATE. How to work:\n' +
    '1. Translate using the dictionary and the grammar rules FIRST. The examples ' +
    'are for word order and morphology (suffixes, agreement), not for copying ' +
    'vocabulary the sentence does not ask for.\n' +
    '2. Prefer the everyday register, the one of daily conversation. Avoid ' +
    'religious or biblical vocabulary unless the sentence explicitly asks for it.\n' +
    '3. If a word has no equivalent in the dictionary or in the examples, do NOT ' +
    'invent it: leave it in square brackets in the translation (for example ' +
    '[vecina]) and list it in words_without_equivalent. This applies to words with ' +
    'their own meaning (nouns, verbs, adjectives, adverbs). Spanish articles, ' +
    'prepositions and other grammatical words (el, la, los, las, un, una, de, a, ' +
    'que…) are NOT translated one by one nor left in square brackets: Damana ' +
    'expresses them with suffixes or does not express them; resolve them with the ' +
    'rules and the examples. Negation («no», «nunca», «nadie»…) is not a separate ' +
    'word either: in Damana it goes in the form of the verb. If the dictionary or ' +
    'the examples include the negative form of that verb (entries such as «No ' +
    'quiero», «yo no tengo»), use it; if they do not, do not leave «no» in square ' +
    'brackets: form the negation as in the most similar negative example, lower ' +
    'the confidence and say so in brief_explanation.\n' +
    '4. Senses marked «possible» are approximations by prefix: use them only if ' +
    'they fit by meaning. Those marked «phrase» translate a whole group of words ' +
    'and those marked «synonym» come from a colloquial Spanish variant (mamá = ' +
    'madre): they are worth the same as an exact one.\n' +
    '5. Proper names are written with the spelling given.\n\n' +
    'Answer ONLY with a valid JSON object, with no extra text or code blocks, with ' +
    'exactly these keys:\n' +
    '{"translation": "<the translation>", ' +
    `"gloss": [{"${origin}": "<word or group from the original>", "${target}": "<segment of the translation that corresponds to it>"}, ...], ` +
    '"words_without_equivalent": ["<word without an equivalent>", ...], ' +
    '"applied_rules": ["<rule used, e.g. -ndzina (plural)>", ...], ' +
    '"confidence": <number between 0 and 1>, ' +
    '"brief_explanation": "<1-3 sentences on how you arrived at the translation>"}'
  );
}

/**
 * What to tell the model when the sentence carries a feature for which the corpus
 * has no rule yet. It is told plainly that it is missing — the speakers
 * will confirm it — instead of letting the model guess whether it exists or not.
 */
const NO_RULE_HINT: Record<Trigger, string> = {
  negation:
    'Follow the negative forms in the dictionary and in the examples ' +
    '(entries such as «No quiero → Nandunun»); «no» is not translated separately nor put in square brackets.',
  plural: 'Follow the examples.',
  possessive: 'Follow the examples.',
  question: 'Follow the examples that are questions.',
  past: 'Follow the past forms that appear in the examples.',
  future: 'Follow the future forms that appear in the examples.',
};

/** Features detected in the sentence with no corpus rule covering them. */
export function triggersWithoutRule(context: RetrievedContext): Trigger[] {
  return context.triggers.filter((d) => !context.rules.some((r) => r.trigger === d));
}

function section(title: string, bodyData: string): string {
  return `=== ${title} ===\n${bodyData}\n`;
}

function listExamples(examples: RetrievedFragment[], empty: string): string {
  if (examples.length === 0) return `(${empty})`;
  return examples
    .map((e, i) => {
      // A warning is added when the example arrived through verbal kinship: it serves as
      // a sample of the verb in use, but it is in another grammatical person.
      const noteText = e.byLemma ? ` — uses another conjugation of the verb «${e.byLemma}»` : '';
      return `${i + 1}. [${e.reference}${noteText}]\n   Spanish: ${e.spanish}\n   Damana: ${e.damana}`;
    })
    .join('\n');
}

export function buildUserPrompt(
  text: string,
  direction: TranslationDirection,
  context: RetrievedContext,
): string {
  const ruleLines = context.rules.map((r) => {
    const example =
      r.baseExample && r.ruleExample
        ? ` E.g.: ${r.baseExample} → ${r.ruleExample}${r.exampleTranslation ? ` = ${r.exampleTranslation}` : ''}.`
        : '';
    const mark = r.trigger ? ` [${r.trigger}]` : '';
    return `- ${r.form} — ${r.meaning ?? ''}${example}${mark}`;
  });
  const features =
    context.triggers.length > 0
      ? `Features detected in the sentence: ${context.triggers.join(', ')}.`
      : 'Features detected in the sentence: none.';
  const withoutRule = triggersWithoutRule(context).map(
    (d) =>
      `- ${d}: feature detected, but the corpus has no rule recorded for it ` +
      `(pending confirmation with the native speakers). ${NO_RULE_HINT[d]}`,
  );
  const rulesBody =
    ruleLines.length || withoutRule.length ? [...ruleLines, ...withoutRule] : ['(no applicable rule)'];
  const rules = [features, ...rulesBody].join('\n');

  const dictionaryLines = context.dictionary.map((a) => {
    const category = a.category ? `; ${a.category}` : '';
    return direction === TranslationDirection.spanish_to_damana
      ? `- ${a.word} → ${a.damana} (${a.spanish}) [${a.match}${category}]`
      : `- ${a.word} → ${a.spanish} (${a.damana}) [${a.match}${category}]`;
  });
  const names = context.properNames.map((n) =>
    direction === TranslationDirection.spanish_to_damana
      ? `- ${n.inText} → ${n.damana} (proper name)`
      : `- ${n.inText} → ${n.spanish} (proper name)`,
  );
  const dictionary = [
    ...(dictionaryLines.length ? dictionaryLines : ['(no word of the sentence is in the dictionary)']),
    ...(names.length ? ['Proper names:', ...names] : []),
  ].join('\n');

  const byDomain = (d: CorpusDomain) => context.examples.filter((e) => e.domain === d);
  const sense =
    direction === TranslationDirection.spanish_to_damana ? 'from Spanish to Damana' : 'from Damana to Spanish';

  return (
    section('GRAMMAR RULES', rules) +
    '\n' +
    section('DICTIONARY FOR THIS SENTENCE', dictionary) +
    '\n' +
    section('EVERYDAY EXAMPLES', listExamples(byDomain(CorpusDomain.everyday), 'no similar everyday examples')) +
    '\n' +
    section('GRAMMAR EXAMPLES', listExamples(byDomain(CorpusDomain.grammar), 'no similar conjugated forms')) +
    '\n' +
    section('BIBLICAL CORPUS EXAMPLES', listExamples(byDomain(CorpusDomain.biblical), 'no similar biblical examples')) +
    '\n' +
    section('SENTENCE TO TRANSLATE', `Direction: ${sense}.\n${text}`)
  );
}

export interface ModelResponse {
  translation: string;
  gloss: { origin: string; target: string }[];
  wordsWithoutEquivalent: string[];
  appliedRules: string[];
  confidence: number;
  briefExplanation: string;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : [];

/** Words the model left in square brackets in the translation. */
export function bracketedWords(translation: string): string[] {
  return [...translation.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim()).filter(Boolean);
}

/**
 * Brings the model's JSON to the internal shape, with tolerance: gloss
 * keys in any of their variants, confidence as a number or text
 * (clamped to 0-1) and the words in square brackets added to the list of
 * words without an equivalent even if the model forgot to list them.
 */
export function normalizeModelResponse(json: Record<string, unknown>): ModelResponse {
  const translation = text(json.translation);
  const gloss = Array.isArray(json.gloss)
    ? json.gloss
        .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
        .map((p) => ({
          origin: text(p.word_es ?? p.word_dm ?? p.origin ?? p.word),
          target: text(p.segment_dm ?? p.segment_es ?? p.target ?? p.segment),
        }))
        .filter((p) => p.origin || p.target)
    : [];
  const withoutEquivalent = new Set(list(json.words_without_equivalent).map((p) => p.replace(/^\[|\]$/g, '')));
  for (const p of bracketedWords(translation)) withoutEquivalent.add(p);

  const rawConfidence = Number(json.confidence);
  const confidence = Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence)) : 0;

  return {
    translation: translation,
    gloss: gloss,
    wordsWithoutEquivalent: [...withoutEquivalent],
    appliedRules: list(json.applied_rules),
    confidence: confidence,
    briefExplanation: text(json.brief_explanation),
  };
}
