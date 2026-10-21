import { normalizar } from '../comun/texto/normalizador';
import { esNegacionEspanol, esStopwordEspanol } from '../comun/texto/stopwords-es';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { Idioma } from './consulta.enums';

/**
 * Rasgo de la frase de entrada que activa una regla gramatical. Se asigna
 * a cada regla al importar (según su «tipo» y su «qué hace») y se detecta
 * en la frase con heurísticas simples en el momento de traducir.
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
  /** null = regla general: se incluye siempre. */
  disparador: Disparador | null;
}

/** Tope de reglas que viajan en el prompt. */
export const MAX_REGLAS = 8;

/**
 * Deduce el disparador de una regla a partir de cómo la describió quien
 * llenó la hoja («pluraliza sustantivos», «posesivo / "de"», «negación»…).
 * Se mira el tipo Y el significado: en la plantilla el tipo suele ser solo
 * «sufijo», que no dice nada del rasgo.
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
 * Qué rasgos gramaticales trae una frase española. Son heurísticas
 * deliberadamente simples: un falso positivo solo añade una regla de más
 * al prompt (el modelo decide si la aplica); un falso negativo deja al
 * modelo sin la pista.
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

/** La forma de una regla («-ndzina») como sufijo comparable, sin guion. */
function sufijoDe(forma: string): string {
  return normalizar(forma).replace(/^-+/, '').trim();
}

/**
 * En damana no hay que adivinar: una regla se activa cuando alguna palabra
 * de la entrada termina en su sufijo (y tiene algo delante).
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
 * Reglas que viajan en el prompt: las generales (sin disparador) siempre,
 * más las activadas por los rasgos de la frase. En damana se activan por
 * sufijo; en español por heurísticas. Nunca más de MAX_REGLAS.
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
