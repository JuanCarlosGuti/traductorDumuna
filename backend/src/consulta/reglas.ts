import { normalizar } from '../comun/texto/normalizador';
import { esNegacionEspanol, esStopwordEspanol } from '../comun/texto/stopwords-es';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { Idioma } from './consulta.enums';

/**
 * Feature of the input sentence that triggers a grammar rule. It is assigned
 * to each rule on import (based on its «tipo» and its «qué hace») and detected
 * in the sentence with simple heuristics at translation time.
 */
export type Disparador =
  | 'plural'
  | 'posesivo'
  | 'negacion'
  | 'pregunta'
  | 'pasado'
  | 'futuro';

export const DISPARADORES: Disparador[] = [
  'plural',
  'posesivo',
  'negacion',
  'pregunta',
  'pasado',
  'futuro',
];

export interface ReglaGramatical {
  id: number;
  tipo: string | null;
  forma: string;
  significado: string | null;
  ejemploBase: string | null;
  ejemploRegla: string | null;
  traduccionEjemplo: string | null;
  notas: string | null;
  /** null = general rule: always included. */
  disparador: Disparador | null;
}

/** Cap on rules that travel in the prompt. */
export const MAX_REGLAS = 8;

/**
 * Infers a rule's trigger from how it was described by whoever
 * filled in the sheet («pluraliza sustantivos», «posesivo / "de"», «negación»…).
 * Both the type AND the meaning are checked: in the template the type is usually just
 * «sufijo», which says nothing about the feature.
 */
export function inferirDisparador(
  tipo: string | null | undefined,
  significado: string | null | undefined,
): Disparador | null {
  const texto = normalizar(`${tipo ?? ''} ${significado ?? ''}`);
  if (/plural/.test(texto)) return 'plural';
  if (/poses|pertenen|genitiv|"de"|«de»|'de'/.test(texto)) return 'posesivo';
  if (/negac|negativ/.test(texto)) return 'negacion';
  if (/pregunt|interrog/.test(texto)) return 'pregunta';
  if (/pasado|preterit/.test(texto)) return 'pasado';
  if (/futuro/.test(texto)) return 'futuro';
  return null;
}

const DETERMINANTES_PLURAL = new Set([
  'los', 'las', 'unos', 'unas', 'muchos', 'muchas', 'varios', 'varias',
  'todos', 'todas', 'algunos', 'algunas', 'pocos', 'pocas', 'ambos', 'ambas',
  'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'estos', 'estas', 'esos', 'esas', 'aquellos', 'aquellas', 'sus', 'mis', 'tus',
  'nuestros', 'nuestras',
]);

const POSESIVOS = new Set([
  'mi', 'mis', 'tu', 'tus', 'su', 'sus', 'nuestro', 'nuestra', 'nuestros',
  'nuestras', 'vuestro', 'vuestra', 'vuestros', 'vuestras', 'mio', 'mia',
  'mios', 'mias', 'tuyo', 'tuya', 'tuyos', 'tuyas', 'suyo', 'suya', 'suyos',
  'suyas', 'de', 'del',
]);

const INTERROGATIVOS = new Set([
  'que', 'quien', 'quienes', 'donde', 'adonde', 'cuando', 'como', 'cual',
  'cuales', 'cuanto', 'cuanta', 'cuantos', 'cuantas', 'por',
]);

const MARCAS_PASADO = new Set([
  'ayer', 'anoche', 'antier', 'anteayer', 'antes', 'hace',
  'fue', 'fui', 'fueron', 'fuimos', 'era', 'eran', 'eras', 'eramos',
  'tuvo', 'tuve', 'tuvieron', 'tuvimos', 'hizo', 'hice', 'hicieron', 'hicimos',
  'vino', 'vine', 'vinieron', 'vinimos', 'dijo', 'dije', 'dijeron', 'dijimos',
  'pudo', 'pude', 'pudieron', 'puso', 'puse', 'pusieron', 'quiso', 'quise',
  'supo', 'supe', 'estuvo', 'estuve', 'estuvieron', 'estaba', 'estaban',
  'habia', 'habian', 'hubo', 'trajo', 'traje', 'dio', 'di', 'dieron', 'vio', 'vi',
]);

const MARCAS_FUTURO = new Set([
  'manana', 'luego', 'despues', 'pronto', 'proximo', 'proxima', 'proximos',
  'proximas', 'sera', 'seran', 'sere', 'seremos', 'habra', 'tendra', 'tendre',
  'ira', 'iran', 'ire', 'iremos', 'vendra', 'vendre', 'hara', 'hare', 'haremos',
]);

const RE_PASADO_REGULAR = /(aron|ieron|aste|iste|aban|abas|aba|ian|ias|imos)$/;
const RE_FUTURO_REGULAR = /(remos|reis|aras|eras|iras|aran|eran|iran)$/;
const RE_PERIFRASIS_FUTURO = /\b(voy|vas|va|vamos|van)\s+a\b/;

/**
 * Which grammatical features a Spanish sentence carries. These are deliberately
 * simple heuristics: a false positive only adds one extra rule
 * to the prompt (the model decides whether to apply it); a false negative leaves the
 * model without the hint.
 */
export function detectarDisparadoresEspanol(texto: string): Disparador[] {
  const tokens = tokenizarDamana(texto);
  const normalizados = tokens.map((t) => t.normalizada);
  const originales = tokens.map((t) => t.original);
  const encontrados = new Set<Disparador>();

  if (/[¿?]/.test(texto) || INTERROGATIVOS.has(normalizados[0] ?? '')) {
    encontrados.add('pregunta');
  }
  if (normalizados.some((t) => esNegacionEspanol(t))) encontrados.add('negacion');
  if (normalizados.some((t) => POSESIVOS.has(t))) encontrados.add('posesivo');

  const pluralLexico = normalizados.some(
    (t) =>
      t.length >= 5 &&
      t.endsWith('s') &&
      !t.endsWith('mos') &&
      !t.endsWith('is') &&
      !esStopwordEspanol(t),
  );
  if (normalizados.some((t) => DETERMINANTES_PLURAL.has(t)) || pluralLexico) {
    encontrados.add('plural');
  }

  const pasado =
    normalizados.some((t) => MARCAS_PASADO.has(t)) ||
    normalizados.some((t) => t.length >= 5 && RE_PASADO_REGULAR.test(t)) ||
    originales.some((t) => t.length >= 3 && /[óí]$/.test(t.normalize('NFC')));
  if (pasado) encontrados.add('pasado');

  const futuro =
    normalizados.some((t) => MARCAS_FUTURO.has(t)) ||
    normalizados.some((t) => t.length >= 5 && RE_FUTURO_REGULAR.test(t)) ||
    originales.some((t) => t.length >= 4 && /r(á|án|é|ás)$/.test(t.normalize('NFC'))) ||
    RE_PERIFRASIS_FUTURO.test(normalizar(texto));
  if (futuro) encontrados.add('futuro');

  return DISPARADORES.filter((d) => encontrados.has(d));
}

/** The form of a rule («-ndzina») as a comparable suffix, without the hyphen. */
function sufijoDe(forma: string): string {
  return normalizar(forma).replace(/^-+/, '').trim();
}

/**
 * In Damana there is no need to guess: a rule is triggered when some word
 * of the input ends in its suffix (and has something before it).
 */
export function reglasPorSufijoDamana(
  texto: string,
  reglas: ReglaGramatical[],
): ReglaGramatical[] {
  const tokens = tokenizarDamana(texto).map((t) => t.normalizada);
  return reglas.filter((regla) => {
    const sufijo = sufijoDe(regla.forma);
    if (!sufijo) return false;
    return tokens.some((t) => t.length > sufijo.length && t.endsWith(sufijo));
  });
}

export interface SeleccionReglas {
  disparadores: Disparador[];
  reglas: ReglaGramatical[];
}

/**
 * Rules that travel in the prompt: the general ones (no trigger) always,
 * plus those triggered by the sentence's features. In Damana they are triggered by
 * suffix; in Spanish by heuristics. Never more than MAX_REGLAS.
 */
export function seleccionarReglas(
  texto: string,
  idioma: Idioma,
  reglas: ReglaGramatical[],
): SeleccionReglas {
  let disparadores: Disparador[];
  let activadas: ReglaGramatical[];

  if (idioma === Idioma.espanol) {
    disparadores = detectarDisparadoresEspanol(texto);
    const activos = new Set(disparadores);
    activadas = reglas.filter((r) => r.disparador !== null && activos.has(r.disparador));
  } else {
    activadas = reglasPorSufijoDamana(texto, reglas);
    disparadores = DISPARADORES.filter((d) => activadas.some((r) => r.disparador === d));
  }

  const generales = reglas.filter((r) => r.disparador === null);
  const vistas = new Set<number>();
  const seleccion = [...activadas, ...generales].filter((r) => {
    if (vistas.has(r.id)) return false;
    vistas.add(r.id);
    return true;
  });
  return { disparadores, reglas: seleccion.slice(0, MAX_REGLAS) };
}
