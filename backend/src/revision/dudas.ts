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
 * Detectores de lo que NO está claro en los datos, para preguntárselo a
 * hablantes nativas. Son funciones puras: reciben listas y devuelven
 * grupos. Nunca corrigen nada; solo arman las preguntas.
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

/** Una forma damana tal como aparece en alguna fuente. */
export interface FormaVista {
  /** Normalizada (minúsculas, sin tildes; ʉ y ñ intactas). */
  forma: string;
  /** Veces que aparece en oraciones y frases. */
  frecuencia: number;
  /** Lo que el vocabulario o las conjugaciones dicen que significa. */
  significados: string[];
  ejemplo?: OracionEjemplo;
}

// ---------------------------------------------------------------------------
// 1. Escritura: la misma palabra escrita de varias maneras
// ---------------------------------------------------------------------------

export interface GrupoEscritura {
  /** Qué alternancia las separa: «u / ʉ», «w / u», «ndzina / nyina»… */
  tipo: string;
  /** De la más usada a la menos usada. */
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

/** Formas que solo se diferencian por una alternancia de escritura conocida. */
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
 * Pares que se diferencian en una letra Y comparten significado en el
 * vocabulario (kʉmatuna «enojó» / kumatuna «furioso»). Sin el significado
 * en común serían ruido: abisha «calentar» y abishi «hiérvalo» también se
 * parecen y son formas legítimas distintas.
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
      // Si lo que cambia es la primera letra suele ser un prefijo de persona
      // (anzhʉngʉma «su hijo» / ranzhʉngʉma «mi hijo»): eso es gramática.
      if (a.clave[0] !== b.clave[0]) continue;
      if (![...a.glosa].some((palabra) => b.glosa.has(palabra))) continue;
      grupos.push(grupo(TIPO_PARECIDAS, [a.f, b.f]));
    }
  }
  return grupos.sort(porTotal);
}

// ---------------------------------------------------------------------------
// 2. Una palabra española con varias formas damana
// ---------------------------------------------------------------------------

export interface OpcionDamana {
  damana: string;
  categoria: string | null;
  fuente: string | null;
  notas: string | null;
  /** Veces en el corpus si es una sola palabra; null si es una frase. */
  frecuencia: number | null;
}

export interface GrupoSinonimos {
  espanol: string;
  opciones: OpcionDamana[];
}

/**
 * Palabras españolas para las que el vocabulario da varias formas damana
 * que NO son la misma con otra escritura (esas van en «escritura»).
 * Pueden ser sinónimos de verdad, sentidos distintos o un error.
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
// 3. Una forma damana con varios significados en español
// ---------------------------------------------------------------------------

export interface SentidoEspanol {
  /** Como está escrita en la fuente, con su tilde si la tiene. */
  damana: string;
  espanol: string;
  fuente: string | null;
}

export interface GrupoPolisemia {
  clave: string;
  /**
   * Las formas del grupo solo se distinguen por la tilde (Ako «córtelo» /
   * Akó «lo cortó»). La app quita las tildes al comparar, así que hoy las
   * trata como la misma palabra: si la tilde marca algo, es una regla.
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
// 4. Entradas que hay que aclarar una por una
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
  /** Ayuda concreta: p. ej. de qué fila vecina parece ser la nota. */
  pista: string;
}

const RE_SEPARADOR_DE_FORMAS = /\/|\s-\s|\p{L}-\p{L}/u;
/** Una coma separa formas solo en casillas cortas; en una oración es puntuación. */
const MAXIMO_PALABRAS_CON_COMA = 4;

function tieneVariasFormas(damana: string): boolean {
  if (RE_SEPARADOR_DE_FORMAS.test(damana)) return true;
  return damana.includes(',') && tokenizarDamana(damana).length <= MAXIMO_PALABRAS_CON_COMA;
}
const RE_SIN_FORMA = /no hay forma|no tiene forma|no hay palabra/i;
const RE_ESPANOL_POCO_CLARO = /\(probable\)|^\s*(verb|afi)\s*:/i;
const RE_FUENTE_HABLANTES = /nativ/i;
/** Hasta cuántas filas de distancia se busca la dueña de una nota corrida. */
const VECINDAD_NOTA = 2;

/** Palabras que las notas usan para explicar y que no identifican a ninguna fila. */
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
 * Entradas del vocabulario que necesitan aclaración. El orden de la lista
 * importa: para detectar notas corridas de fila se miran las vecinas (en
 * el bloque «nativas 2026-10» la nota de «pastores» quedó en «pedazo»).
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
// 5. Terminaciones: la gramática que se ve en las palabras
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
   * La oración española menciona el significado de la palabra base: señal
   * de que la raíz es de verdad esa palabra y no un parecido casual
   * (anzhʉn «sueño» no es la base de anzhʉnga «importante»).
   */
  encaja: boolean;
}

function encajaConLaOracion(significado: string, ejemplo?: OracionEjemplo): boolean {
  if (!ejemplo) return false;
  const palabras = (texto: string) =>
    tokenizarDamana(texto)
      .map((t) => t.normalizada)
      .filter((t) => t.length >= 4);
  // Del significado cuentan las palabras de contenido; si solo trae
  // palabras gramaticales («Ellos»), valen esas.
  const todas = palabras(significado);
  const contenido = todas.filter((t) => !esStopwordEspanol(t));
  const enOracion = new Set(palabras(ejemplo.espanol).map((t) => t.slice(0, 4)));
  return (contenido.length > 0 ? contenido : todas).some((t) => enOracion.has(t.slice(0, 4)));
}

export interface TerminacionCandidata {
  terminacion: string;
  /** En cuántas palabras base distintas aparece. */
  raices: number;
  /** Regla o entrada del diccionario que ya la explica, si existe. */
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
 * Terminaciones que se repiten detrás de palabras que ya conocemos:
 * urraga «casa» aparece como urragamba, urragaka, urraganzhe… Si «-mba»
 * sale detrás de 40 palabras distintas es gramática, no casualidad, y
 * vale la pena preguntar qué agrega.
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
