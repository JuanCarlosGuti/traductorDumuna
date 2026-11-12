import { CorpusDomain } from '../consulta/consulta.enums';
import { Trigger } from '../consulta/reglas';
import { RetrievedContext, RetrievedFragment } from '../consulta/retrieval.service';
import { TranslationDirection } from './dto/traduccion.dto';

/** Names of the keys of each gloss pair depending on the direction. */
export function glossKeys(direction: TranslationDirection): { origen: string; destino: string } {
  return direction === TranslationDirection.espanol_a_damana
    ? { origen: 'palabra_es', destino: 'segmento_dm' }
    : { origen: 'palabra_dm', destino: 'segmento_es' };
}

/** JSON Schema of the response: used by Anthropic's structured output. */
export function responseSchema(direction: TranslationDirection): Record<string, unknown> {
  const { origen: origin, destino: target } = glossKeys(direction);
  return {
    type: 'object',
    properties: {
      traduccion: { type: 'string' },
      glosa: {
        type: 'array',
        items: {
          type: 'object',
          properties: { [origin]: { type: 'string' }, [target]: { type: 'string' } },
          required: [origin, target],
          additionalProperties: false,
        },
      },
      palabras_sin_equivalente: { type: 'array', items: { type: 'string' } },
      reglas_aplicadas: { type: 'array', items: { type: 'string' } },
      confianza: { type: 'number' },
      explicacion_breve: { type: 'string' },
    },
    required: [
      'traduccion',
      'glosa',
      'palabras_sin_equivalente',
      'reglas_aplicadas',
      'confianza',
      'explicacion_breve',
    ],
    additionalProperties: false,
  };
}

export function buildSystemPrompt(direction: TranslationDirection): string {
  const { origen: origin, destino: target } = glossKeys(direction);
  return (
    'Eres un traductor experto entre el damana (dʉmʉna), lengua del pueblo Wiwa ' +
    'de la Sierra Nevada de Santa Marta (Colombia), y el español. En damana la ' +
    'vocal ʉ (U+0289) es una letra plena distinta de u, y la ñ también es letra ' +
    'plena: cópialas tal cual, nunca las sustituyas.\n\n' +
    'Recibirás un mensaje con secciones fijas: REGLAS GRAMATICALES, DICCIONARIO DE ' +
    'ESTA FRASE, EJEMPLOS COTIDIANOS, EJEMPLOS DE GRAMÁTICA, EJEMPLOS DEL CORPUS ' +
    'BÍBLICO y FRASE A TRADUCIR. Cómo trabajar:\n' +
    '1. Traduce usando PRIMERO el diccionario y las reglas gramaticales. Los ' +
    'ejemplos sirven para el orden de las palabras y la morfología (sufijos, ' +
    'concordancia), no para copiar vocabulario que la frase no pide.\n' +
    '2. Prefiere el registro cotidiano, el de la conversación diaria. Evita el ' +
    'vocabulario religioso o bíblico salvo que la frase lo pida expresamente.\n' +
    '3. Si una palabra no tiene equivalente ni en el diccionario ni en los ' +
    'ejemplos, NO la inventes: déjala entre corchetes en la traducción (por ' +
    'ejemplo [vecina]) y lístala en palabras_sin_equivalente. Esto vale para ' +
    'palabras con significado propio (sustantivos, verbos, adjetivos, ' +
    'adverbios). Los artículos, preposiciones y demás palabras gramaticales ' +
    'del español (el, la, los, las, un, una, de, a, que…) NO se traducen una ' +
    'por una ni se dejan entre corchetes: el damana los expresa con sufijos o ' +
    'no los expresa; resuélvelos con las reglas y los ejemplos. La negación ' +
    '(«no», «nunca», «nadie»…) tampoco es una palabra suelta: en damana va en ' +
    'la forma del verbo. Si el diccionario o los ejemplos traen la forma ' +
    'negativa de ese verbo (entradas como «No quiero», «yo no tengo»), úsala; ' +
    'si no la traen, no dejes «no» entre corchetes: forma la negación como en ' +
    'el ejemplo negativo más parecido, baja la confianza y dilo en ' +
    'explicacion_breve.\n' +
    '4. Las acepciones marcadas «posible» son aproximaciones por prefijo: úsalas ' +
    'solo si encajan por significado. Las marcadas «frase» traducen un grupo de ' +
    'palabras completo y las marcadas «sinonimo» vienen de una variante ' +
    'coloquial del español (mamá = madre): valen igual que una exacta.\n' +
    '5. Los nombres propios se escriben con la grafía que se indica.\n\n' +
    'Responde EXCLUSIVAMENTE con un objeto JSON válido, sin texto adicional ni ' +
    'bloques de código, con exactamente estas claves:\n' +
    '{"traduccion": "<la traducción>", ' +
    `"glosa": [{"${origin}": "<palabra o grupo del original>", "${target}": "<segmento de la traducción que le corresponde>"}, ...], ` +
    '"palabras_sin_equivalente": ["<palabra sin equivalente>", ...], ' +
    '"reglas_aplicadas": ["<regla usada, p. ej. -ndzina (plural)>", ...], ' +
    '"confianza": <número entre 0 y 1>, ' +
    '"explicacion_breve": "<1-3 frases sobre cómo llegaste a la traducción>"}'
  );
}

/**
 * What to tell the model when the sentence carries a feature for which the corpus
 * has no rule yet. It is told plainly that it is missing — the speakers
 * will confirm it — instead of letting the model guess whether it exists or not.
 */
const NO_RULE_HINT: Record<Trigger, string> = {
  negacion:
    'Guíate por las formas negativas del diccionario y de los ejemplos ' +
    '(entradas como «No quiero → Nandunun»); «no» no se traduce aparte ni va entre corchetes.',
  plural: 'Guíate por los ejemplos.',
  posesivo: 'Guíate por los ejemplos.',
  pregunta: 'Guíate por los ejemplos que son preguntas.',
  pasado: 'Guíate por las formas de pasado que aparezcan en los ejemplos.',
  futuro: 'Guíate por las formas de futuro que aparezcan en los ejemplos.',
};

/** Features detected in the sentence with no corpus rule covering them. */
export function triggersWithoutRule(context: RetrievedContext): Trigger[] {
  return context.disparadores.filter((d) => !context.reglas.some((r) => r.disparador === d));
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
      const noteText = e.porLema ? ` — usa otra conjugación del verbo «${e.porLema}»` : '';
      return `${i + 1}. [${e.referencia}${noteText}]\n   español: ${e.espanol}\n   damana: ${e.damana}`;
    })
    .join('\n');
}

export function buildUserPrompt(
  text: string,
  direction: TranslationDirection,
  context: RetrievedContext,
): string {
  const ruleLines = context.reglas.map((r) => {
    const example =
      r.ejemploBase && r.ejemploRegla
        ? ` Ej.: ${r.ejemploBase} → ${r.ejemploRegla}${r.traduccionEjemplo ? ` = ${r.traduccionEjemplo}` : ''}.`
        : '';
    const mark = r.disparador ? ` [${r.disparador}]` : '';
    return `- ${r.forma} — ${r.significado ?? ''}${example}${mark}`;
  });
  const features =
    context.disparadores.length > 0
      ? `Rasgos detectados en la frase: ${context.disparadores.join(', ')}.`
      : 'Rasgos detectados en la frase: ninguno.';
  const withoutRule = triggersWithoutRule(context).map(
    (d) =>
      `- ${d}: rasgo detectado, pero el corpus no tiene regla registrada ` +
      `(pendiente de confirmar con las hablantes). ${NO_RULE_HINT[d]}`,
  );
  const rulesBody =
    ruleLines.length || withoutRule.length ? [...ruleLines, ...withoutRule] : ['(ninguna regla aplicable)'];
  const rules = [features, ...rulesBody].join('\n');

  const dictionaryLines = context.diccionario.map((a) => {
    const category = a.categoria ? `; ${a.categoria}` : '';
    return direction === TranslationDirection.espanol_a_damana
      ? `- ${a.palabra} → ${a.damana} (${a.espanol}) [${a.coincidencia}${category}]`
      : `- ${a.palabra} → ${a.espanol} (${a.damana}) [${a.coincidencia}${category}]`;
  });
  const names = context.nombresPropios.map((n) =>
    direction === TranslationDirection.espanol_a_damana
      ? `- ${n.enTexto} → ${n.damana} (nombre propio)`
      : `- ${n.enTexto} → ${n.espanol} (nombre propio)`,
  );
  const dictionary = [
    ...(dictionaryLines.length ? dictionaryLines : ['(ninguna palabra de la frase está en el diccionario)']),
    ...(names.length ? ['Nombres propios:', ...names] : []),
  ].join('\n');

  const byDomain = (d: CorpusDomain) => context.ejemplos.filter((e) => e.dominio === d);
  const sense =
    direction === TranslationDirection.espanol_a_damana ? 'del español al damana' : 'del damana al español';

  return (
    section('REGLAS GRAMATICALES', rules) +
    '\n' +
    section('DICCIONARIO DE ESTA FRASE', dictionary) +
    '\n' +
    section('EJEMPLOS COTIDIANOS', listExamples(byDomain(CorpusDomain.cotidiano), 'sin ejemplos cotidianos parecidos')) +
    '\n' +
    section('EJEMPLOS DE GRAMÁTICA', listExamples(byDomain(CorpusDomain.gramatica), 'sin formas conjugadas parecidas')) +
    '\n' +
    section('EJEMPLOS DEL CORPUS BÍBLICO', listExamples(byDomain(CorpusDomain.biblico), 'sin ejemplos bíblicos parecidos')) +
    '\n' +
    section('FRASE A TRADUCIR', `Dirección: ${sense}.\n${text}`)
  );
}

export interface ModelResponse {
  traduccion: string;
  glosa: { origen: string; destino: string }[];
  palabrasSinEquivalente: string[];
  reglasAplicadas: string[];
  confianza: number;
  explicacionBreve: string;
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
  const translation = text(json.traduccion);
  const gloss = Array.isArray(json.glosa)
    ? json.glosa
        .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
        .map((p) => ({
          origen: text(p.palabra_es ?? p.palabra_dm ?? p.origen ?? p.palabra),
          destino: text(p.segmento_dm ?? p.segmento_es ?? p.destino ?? p.segmento),
        }))
        .filter((p) => p.origen || p.destino)
    : [];
  const withoutEquivalent = new Set(list(json.palabras_sin_equivalente).map((p) => p.replace(/^\[|\]$/g, '')));
  for (const p of bracketedWords(translation)) withoutEquivalent.add(p);

  const rawConfidence = Number(json.confianza);
  const confidence = Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence)) : 0;

  return {
    traduccion: translation,
    glosa: gloss,
    palabrasSinEquivalente: [...withoutEquivalent],
    reglasAplicadas: list(json.reglas_aplicadas),
    confianza: confidence,
    explicacionBreve: text(json.explicacion_breve),
  };
}
