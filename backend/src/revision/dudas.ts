import {
  aDistanciaUno,
  esqueletoOrtografico,
  reglasQueDistinguen,
} from '../comun/texto/esqueleto';
import { normalizar } from '../comun/texto/normalizador';
import { esStopwordEspanol } from '../comun/texto/stopwords-es';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { alternativasEspanol } from '../consulta/diccionario';

/**
 * Detectors of what is NOT clear in the data, to ask native
 * speakers about it. They are pure functions: they receive lists and return
 * groups. They never fix anything; they only build the questions.
 */

export interface OracionEjemplo {
  damana: string;
  espanol: string;
}

export interface EntradaLexica {
  espanol: string;
  damana: string;
  categoria: string | null;
  notas: string | null;
  fuente: string | null;
}

/** A Damana form as it appears in some source. */
export interface FormaVista {
  /** Normalized (lowercase, no accents; ʉ and ñ intact). */
  forma: string;
  /** Times it appears in sentences and phrases. */
  frecuencia: number;
  /** What the vocabulary or the conjugations say it means. */
  significados: string[];
  ejemplo?: OracionEjemplo;
}

// ---------------------------------------------------------------------------
// 1. Spelling: the same word written in several ways
// ---------------------------------------------------------------------------

export interface GrupoEscritura {
  /** Which alternation separates them: «u / ʉ», «w / u», «ndzina / nyina»… */
  tipo: string;
  /** From most used to least used. */
  formas: FormaVista[];
  total: number;
}

export const LONGITUD_MINIMA_VARIANTE = 4;
export const TIPO_PARECIDAS = 'se parecen y significan lo mismo';

const porUso = (a: FormaVista, b: FormaVista) =>
  b.frecuencia - a.frecuencia || a.forma.localeCompare(b.forma, 'es');

const porTotal = (a: GrupoEscritura, b: GrupoEscritura) =>
  b.total - a.total || a.formas[0].forma.localeCompare(b.formas[0].forma, 'es');

function grupo(tipo: string, formas: FormaVista[]): GrupoEscritura {
  const ordenadas = [...formas].sort(porUso);
  return { tipo, formas: ordenadas, total: ordenadas.reduce((s, f) => s + f.frecuencia, 0) };
}

/** Forms that differ only by a known spelling alternation. */
export function detectarVariantes(formas: FormaVista[]): GrupoEscritura[] {
  const porEsqueleto = new Map<string, Map<string, FormaVista>>();
  for (const f of formas) {
    const clave = esqueletoOrtografico(f.forma);
    if (clave.length < LONGITUD_MINIMA_VARIANTE) continue;
    const vistas = porEsqueleto.get(clave) ?? new Map<string, FormaVista>();
    if (!vistas.has(f.forma)) vistas.set(f.forma, f);
    porEsqueleto.set(clave, vistas);
  }
  return [...porEsqueleto.values()]
    .filter((vistas) => vistas.size > 1)
    .map((vistas) => {
      const lista = [...vistas.values()];
      return grupo(reglasQueDistinguen(lista.map((f) => f.forma)).join(' + ') || 'otra', lista);
    })
    .sort(porTotal);
}

function palabrasDeContenido(texto: string): Set<string> {
  return new Set(
    tokenizarDamana(texto)
      .map((t) => t.normalizada)
      .filter((t) => t.length >= 3 && !esStopwordEspanol(t)),
  );
}

/**
 * Pairs that differ by one letter AND share a meaning in the
 * vocabulary (kʉmatuna «enojó» / kumatuna «furioso»). Without the shared
 * meaning they would be noise: abisha «calentar» and abishi «hiérvalo» also look
 * alike and are legitimately different forms.
 */
export function detectarParecidas(formas: FormaVista[]): GrupoEscritura[] {
  const candidatas = formas
    .filter((f) => f.significados.length > 0 && f.forma.length >= 6)
    .map((f) => ({
      f,
      clave: esqueletoOrtografico(f.forma),
      glosa: palabrasDeContenido(f.significados.join(' ')),
    }));
  const grupos: GrupoEscritura[] = [];
  for (let i = 0; i < candidatas.length; i++) {
    for (let j = i + 1; j < candidatas.length; j++) {
      const a = candidatas[i];
      const b = candidatas[j];
      if (a.clave === b.clave || !aDistanciaUno(a.clave, b.clave)) continue;
      // If what changes is the first letter it is usually a person prefix
      // (anzhʉngʉma «su hijo» / ranzhʉngʉma «mi hijo»): that is grammar.
      if (a.clave[0] !== b.clave[0]) continue;
      if (![...a.glosa].some((palabra) => b.glosa.has(palabra))) continue;
      grupos.push(grupo(TIPO_PARECIDAS, [a.f, b.f]));
    }
  }
  return grupos.sort(porTotal);
}

// ---------------------------------------------------------------------------
// 2. One Spanish word with several Damana forms
// ---------------------------------------------------------------------------

export interface OpcionDamana {
  damana: string;
  categoria: string | null;
  fuente: string | null;
  notas: string | null;
  /** Times in the corpus if it is a single word; null if it is a phrase. */
  frecuencia: number | null;
}

export interface GrupoSinonimos {
  espanol: string;
  opciones: OpcionDamana[];
}

/**
 * Spanish words for which the vocabulary gives several Damana forms
 * that are NOT the same one with another spelling (those go under «escritura»).
 * They may be real synonyms, different senses or a mistake.
 */
export function detectarSinonimos(entradas: EntradaLexica[]): GrupoSinonimos[] {
  const porEspanol = new Map<string, { texto: string; opciones: Map<string, OpcionDamana> }>();
  for (const e of entradas) {
    for (const alternativa of alternativasEspanol(e.espanol)) {
      const clave = tokenizarDamana(alternativa)
        .map((t) => t.normalizada)
        .join(' ');
      if (!clave) continue;
      const grupoEs = porEspanol.get(clave) ?? {
        texto: alternativa.trim(),
        opciones: new Map<string, OpcionDamana>(),
      };
      const claveDamana = normalizar(e.damana.trim());
      if (!grupoEs.opciones.has(claveDamana)) {
        grupoEs.opciones.set(claveDamana, {
          damana: e.damana.trim(),
          categoria: e.categoria,
          fuente: e.fuente,
          notas: e.notas,
          frecuencia: null,
        });
      }
      porEspanol.set(clave, grupoEs);
    }
  }
  return [...porEspanol.values()]
    .filter((g) => g.opciones.size > 1)
    .filter((g) => new Set([...g.opciones.keys()].map(esqueletoOrtografico)).size > 1)
    .map((g) => ({ espanol: g.texto, opciones: [...g.opciones.values()] }))
    .sort((a, b) => a.espanol.localeCompare(b.espanol, 'es'));
}

// ---------------------------------------------------------------------------
// 3. One Damana form with several meanings in Spanish
// ---------------------------------------------------------------------------

export interface SentidoEspanol {
  /** As written in the source, with its accent if it has one. */
  damana: string;
  espanol: string;
  fuente: string | null;
}

export interface GrupoPolisemia {
  clave: string;
  /**
   * The forms in the group are told apart only by the accent (Ako «córtelo» /
   * Akó «lo cortó»). The app strips accents when comparing, so today it
   * treats them as the same word: if the accent marks something, it is a rule.
   */
  soloTilde: boolean;
  sentidos: SentidoEspanol[];
}

export function detectarPolisemia(entradas: EntradaLexica[]): GrupoPolisemia[] {
  const porDamana = new Map<string, Map<string, SentidoEspanol>>();
  for (const e of entradas) {
    const clave = normalizar(e.damana.trim()).replace(/\s+/g, ' ');
    if (!clave) continue;
    const sentidos = porDamana.get(clave) ?? new Map<string, SentidoEspanol>();
    const claveEspanol = normalizar(e.espanol.trim());
    if (!sentidos.has(claveEspanol)) {
      sentidos.set(claveEspanol, {
        damana: e.damana.trim(),
        espanol: e.espanol.trim(),
        fuente: e.fuente,
      });
    }
    porDamana.set(clave, sentidos);
  }
  return [...porDamana.entries()]
    .filter(([, sentidos]) => sentidos.size > 1)
    .map(([clave, sentidos]) => {
      const lista = [...sentidos.values()];
      const escritas = new Set(lista.map((s) => s.damana.toLowerCase().normalize('NFC')));
      return { clave, soloTilde: escritas.size > 1, sentidos: lista };
    })
    .sort(
      (a, b) => Number(b.soloTilde) - Number(a.soloTilde) || a.clave.localeCompare(b.clave, 'es'),
    );
}

// ---------------------------------------------------------------------------
// 4. Entries that must be clarified one by one
// ---------------------------------------------------------------------------

export type MotivoDuda =
  | 'igual_que_espanol'
  | 'sin_forma'
  | 'varias_formas'
  | 'nota_de_otra_palabra'
  | 'espanol_poco_claro'
  | 'nota_por_confirmar';

export const TEXTO_MOTIVO: Record<MotivoDuda, string> = {
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

export interface EntradaDudosa {
  entrada: EntradaLexica;
  motivos: MotivoDuda[];
  /** Concrete help: e.g. which neighbouring row the note seems to belong to. */
  pista: string;
}

const RE_SEPARADOR_DE_FORMAS = /\/|\s-\s|\p{L}-\p{L}/u;
/** A comma separates forms only in short cells; in a sentence it is punctuation. */
const MAXIMO_PALABRAS_CON_COMA = 4;

function tieneVariasFormas(damana: string): boolean {
  if (RE_SEPARADOR_DE_FORMAS.test(damana)) return true;
  return damana.includes(',') && tokenizarDamana(damana).length <= MAXIMO_PALABRAS_CON_COMA;
}
const RE_SIN_FORMA = /no hay forma|no tiene forma|no hay palabra/i;
const RE_ESPANOL_POCO_CLARO = /\(probable\)|^\s*(verb|afi)\s*:/i;
const RE_FUENTE_HABLANTES = /nativ/i;
/** How many rows away to look for the owner of a shifted note. */
const VECINDAD_NOTA = 2;

/** Words the notes use to explain and that identify no row. */
const PALABRAS_DE_EXPLICACION = new Set(
  [
    'damana', 'dumuna', 'ejemplo', 'palabra', 'palabras', 'significa', 'quiere', 'decir',
    'refiere', 'varios', 'varias', 'forma', 'traducir', 'traducirlo', 'traduzca', 'texto',
    'citado', 'pasado', 'tambien', 'puede', 'podemos', 'cuando', 'encuentra', 'agrega',
    'agregado', 'nombre', 'nombres', 'propios', 'lugares', 'escribe', 'suele', 'traducirse',
    'realmente', 'frase', 'porque', 'mismo', 'tiempo', 'lugar', 'persona', 'personas',
  ].map(esqueletoOrtografico),
);

function clavesDe(texto: string): string[] {
  return tokenizarDamana(texto)
    .map((t) => esqueletoOrtografico(t.normalizada))
    .filter((k) => k.length >= 5 && !esStopwordEspanol(k));
}

function laNotaMenciona(clavesNota: string[], entrada: EntradaLexica): boolean {
  const propias = [...clavesDe(entrada.damana), ...clavesDe(entrada.espanol)];
  return propias.some((p) => clavesNota.some((n) => n === p || aDistanciaUno(n, p)));
}

/**
 * Vocabulary entries that need clarification. The order of the list
 * matters: to detect notes shifted to another row the neighbours are checked (in
 * the «nativas 2026-10» block the note for «pastores» ended up on «pedazo»).
 */
export function detectarEntradasDudosas(entradas: EntradaLexica[]): EntradaDudosa[] {
  const dudosas: EntradaDudosa[] = [];
  entradas.forEach((entrada, i) => {
    const motivos: MotivoDuda[] = [];
    let pista = '';
    const nota = (entrada.notas ?? '').trim();

    if (normalizar(entrada.damana.trim()) === normalizar(entrada.espanol.trim())) {
      motivos.push('igual_que_espanol');
    }
    if (RE_SIN_FORMA.test(nota)) motivos.push('sin_forma');
    if (tieneVariasFormas(entrada.damana)) motivos.push('varias_formas');
    if (RE_ESPANOL_POCO_CLARO.test(entrada.espanol)) motivos.push('espanol_poco_claro');

    const esDeHablantes = RE_FUENTE_HABLANTES.test(entrada.fuente ?? '');
    if (esDeHablantes && nota) {
      const clavesNota = clavesDe(nota).filter((k) => !PALABRAS_DE_EXPLICACION.has(k));
      if (clavesNota.length > 0 && !laNotaMenciona(clavesNota, entrada)) {
        for (let d = 1; d <= VECINDAD_NOTA && !pista; d++) {
          for (const vecina of [entradas[i + d], entradas[i - d]]) {
            if (vecina && laNotaMenciona(clavesNota, vecina)) {
              pista = `¿La nota será de «${vecina.espanol} = ${vecina.damana}»?`;
              break;
            }
          }
        }
        if (pista) motivos.push('nota_de_otra_palabra');
      }
      if (!motivos.includes('nota_de_otra_palabra') && !motivos.includes('sin_forma')) {
        motivos.push('nota_por_confirmar');
      }
    }

    if (motivos.length > 0) dudosas.push({ entrada, motivos, pista });
  });
  return dudosas;
}

// ---------------------------------------------------------------------------
// 5. Endings: the grammar that shows in the words
// ---------------------------------------------------------------------------

export interface RaizConocida {
  raiz: string;
  significado: string;
}

export interface TokenCorpus {
  frecuencia: number;
  ejemplo?: OracionEjemplo;
}

export interface EjemploTerminacion {
  raiz: string;
  significado: string;
  forma: string;
  frecuencia: number;
  ejemplo?: OracionEjemplo;
  /**
   * The Spanish sentence mentions the meaning of the base word: a sign
   * that the root really is that word and not a chance resemblance
   * (anzhʉn «sueño» is not the base of anzhʉnga «importante»).
   */
  encaja: boolean;
}

function encajaConLaOracion(significado: string, ejemplo?: OracionEjemplo): boolean {
  if (!ejemplo) return false;
  const palabras = (texto: string) =>
    tokenizarDamana(texto)
      .map((t) => t.normalizada)
      .filter((t) => t.length >= 4);
  // From the meaning, content words count; if it only carries
  // function words («Ellos»), those are used.
  const todas = palabras(significado);
  const contenido = todas.filter((t) => !esStopwordEspanol(t));
  const enOracion = new Set(palabras(ejemplo.espanol).map((t) => t.slice(0, 4)));
  return (contenido.length > 0 ? contenido : todas).some((t) => enOracion.has(t.slice(0, 4)));
}

export interface TerminacionCandidata {
  terminacion: string;
  /** In how many distinct base words it appears. */
  raices: number;
  /** Rule or dictionary entry that already explains it, if any. */
  yaSabemos: string;
  ejemplos: EjemploTerminacion[];
}

export interface OpcionesTerminaciones {
  minimoRaices?: number;
  maximo?: number;
  ejemplosPorTerminacion?: number;
}

export const LETRAS_TERMINACION = { minimo: 2, maximo: 7 };

/**
 * Endings that repeat after words we already know:
 * urraga «casa» appears as urragamba, urragaka, urraganzhe… If «-mba»
 * shows up after 40 different words it is grammar, not chance, and
 * it is worth asking what it adds.
 */
export function detectarTerminaciones(
  raices: RaizConocida[],
  tokens: Map<string, TokenCorpus>,
  conocidas: Map<string, string>,
  opciones: OpcionesTerminaciones = {},
): TerminacionCandidata[] {
  const { minimoRaices = 6, maximo = 30, ejemplosPorTerminacion = 3 } = opciones;
  const unicas = new Map<string, RaizConocida>();
  for (const r of raices) if (r.raiz.length >= 4 && !unicas.has(r.raiz)) unicas.set(r.raiz, r);

  const porTerminacion = new Map<string, Map<string, EjemploTerminacion>>();
  for (const [forma, info] of tokens) {
    for (const r of unicas.values()) {
      const extra = forma.length - r.raiz.length;
      if (extra < LETRAS_TERMINACION.minimo || extra > LETRAS_TERMINACION.maximo) continue;
      if (!forma.startsWith(r.raiz)) continue;
      const terminacion = forma.slice(r.raiz.length);
      const porRaiz = porTerminacion.get(terminacion) ?? new Map<string, EjemploTerminacion>();
      const previo = porRaiz.get(r.raiz);
      if (!previo || info.frecuencia > previo.frecuencia) {
        porRaiz.set(r.raiz, {
          raiz: r.raiz,
          significado: r.significado,
          forma,
          frecuencia: info.frecuencia,
          ejemplo: info.ejemplo,
          encaja: encajaConLaOracion(r.significado, info.ejemplo),
        });
      }
      porTerminacion.set(terminacion, porRaiz);
    }
  }

  return [...porTerminacion.entries()]
    .filter(([, porRaiz]) => porRaiz.size >= minimoRaices)
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0], 'es'))
    .slice(0, maximo)
    .map(([terminacion, porRaiz]) => ({
      terminacion,
      raices: porRaiz.size,
      yaSabemos: conocidas.get(terminacion) ?? '',
      ejemplos: [...porRaiz.values()]
        .sort((a, b) => Number(b.encaja) - Number(a.encaja) || b.frecuencia - a.frecuencia)
        .slice(0, ejemplosPorTerminacion),
    }));
}
