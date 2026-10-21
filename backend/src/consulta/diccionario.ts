import { normalizar } from '../comun/texto/normalizador';
import { esNegacionEspanol, esStopwordEspanol } from '../comun/texto/stopwords-es';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { Idioma } from './consulta.enums';
import { VocabularioDto } from './dto/consulta.dto';

/**
 * Cómo se encontró la acepción, de más a menos fiable:
 *  - exacta: la palabra tal cual (misma tilde).
 *  - sin_tildes: igual tras normalizar (mamá = mama).
 *  - sinonimo: variante coloquial del español que el vocabulario registra
 *    bajo otra palabra (mamá → madre).
 *  - singular: quitando -s / -es a la palabra de entrada.
 *  - frase: entrada de varias palabras cuyas palabras están todas en la frase.
 *  - posible: comparten las 5 primeras letras (puede ser otra palabra).
 */
export type TipoCoincidencia =
  | 'exacta'
  | 'sin_tildes'
  | 'sinonimo'
  | 'singular'
  | 'frase'
  | 'posible';

export interface AcepcionEncontrada {
  /** Palabra de la frase de entrada que motivó la búsqueda. */
  palabra: string;
  espanol: string;
  damana: string;
  categoria: string | null;
  notas: string | null;
  coincidencia: TipoCoincidencia;
}

/** Tope global de acepciones que viajan en el prompt. */
export const MAX_ACEPCIONES = 40;
/** Tope de acepciones «posible» (por prefijo) por palabra. */
export const MAX_POSIBLES_POR_PALABRA = 3;
export const LETRAS_PREFIJO = 5;

/**
 * Variantes coloquiales o afectivas del español (clave normalizada) que el
 * vocabulario, hecho a partir de un diccionario, registra bajo la palabra
 * formal. Es sinonimia del español, no una traducción inventada: la
 * palabra damana es la misma. Lista corta y evidente a propósito.
 */
export const SINONIMOS_ES: Record<string, string[]> = {
  mama: ['madre'],
  mami: ['madre'],
  mamita: ['madre'],
  papa: ['padre'],
  papi: ['padre'],
  papito: ['padre'],
  abuelita: ['abuela'],
  abuelito: ['abuelo'],
  hermanita: ['hermana menor', 'hermana'],
  hermanito: ['hermano menor', 'hermano'],
  nena: ['niña'],
  nene: ['niño'],
  chica: ['niña', 'jovencita'],
  chico: ['niño', 'joven'],
  marido: ['esposo'],
  casita: ['casa'],
  perrito: ['perro'],
  perrita: ['perro'],
  gatito: ['gato'],
  aguita: ['agua'],
};

interface Entrada {
  espanol: string;
  damana: string;
  categoria: string | null;
  notas: string | null;
}

interface Frase {
  /** Texto tal cual de la alternativa, para mostrar qué se reconoció. */
  texto: string;
  /** Tokens normalizados de contenido (sin stopwords en español). */
  tokens: string[];
  entrada: Entrada;
}

type Emisor = (palabra: string, entradas: Entrada[], coincidencia: TipoCoincidencia) => void;

/**
 * Variantes del lado español de una entrada: «Igual, lo mismo» y «Ese o
 * esa» son dos acepciones cada una; «Cocinera (ave)» se indexa como
 * «cocinera»; «Verb: Hacer» como «hacer». Los paréntesis se quitan porque
 * son aclaraciones, no parte de la palabra. Se parte por «o»/«u» pero NO
 * por «y»: «Madre del agua y peces» es una sola cosa.
 */
export function alternativasEspanol(espanol: string): string[] {
  return espanol
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^\s*\p{L}+:\s*/u, '')
    .split(/[,;/]|\s[–-]\s|\s[ou]\s/)
    .map((a) => a.replace(/[¿?¡!."]/g, ' ').trim())
    .filter((a) => a.length > 0);
}

/** Candidatos a singular de una palabra normalizada: flores → flor, casas → casa. */
export function candidatosSingular(normalizada: string): string[] {
  const candidatos: string[] = [];
  if (normalizada.length > 4 && normalizada.endsWith('es')) {
    candidatos.push(normalizada.slice(0, -2));
  }
  if (normalizada.length > 3 && normalizada.endsWith('s')) {
    candidatos.push(normalizada.slice(0, -1));
  }
  return candidatos;
}

/**
 * Índice del vocabulario para resolver cada palabra de una frase. Se
 * construye una vez (≈1.500 entradas) y se consulta en cada traducción.
 */
export class IndiceDiccionario {
  private readonly exactaEs = new Map<string, Entrada[]>();
  private readonly normalizadaEs = new Map<string, Entrada[]>();
  private readonly frasesEs: Frase[] = [];
  /** Cualquier alternativa española completa (una o varias palabras), normalizada. */
  private readonly alternativaEs = new Map<string, Entrada[]>();
  private readonly normalizadaDm = new Map<string, Entrada[]>();
  private readonly frasesDm: Frase[] = [];
  private readonly clavesEs: string[];
  private readonly clavesDm: string[];

  constructor(entradas: VocabularioDto[]) {
    for (const dto of entradas) {
      const entrada: Entrada = {
        espanol: dto.espanol,
        damana: dto.damana,
        categoria: dto.categoria ?? null,
        notas: dto.notas ?? null,
      };
      for (const alternativa of alternativasEspanol(dto.espanol)) {
        const tokens = tokenizarDamana(alternativa);
        agregar(this.alternativaEs, tokens.map((t) => t.normalizada).join(' '), entrada);
        if (tokens.length === 1) {
          agregar(this.exactaEs, tokens[0].original.toLowerCase().normalize('NFC'), entrada);
          agregar(this.normalizadaEs, tokens[0].normalizada, entrada);
        } else if (tokens.length > 1) {
          // Las negaciones se conservan como contenido: «No quiero» solo debe
          // entrar cuando la frase trae el «no». Si se quitaran como
          // stopwords, la forma negativa saldría también para «quiero» y el
          // modelo recibiría un verbo negado para una frase afirmativa.
          const contenido = tokens
            .map((t) => t.normalizada)
            .filter((t) => !esStopwordEspanol(t) || esNegacionEspanol(t));
          if (contenido.length > 0) {
            this.frasesEs.push({ texto: alternativa, tokens: contenido, entrada });
          }
        }
      }
      const tokensDm = tokenizarDamana(dto.damana);
      if (tokensDm.length === 1) {
        agregar(this.normalizadaDm, tokensDm[0].normalizada, entrada);
      } else if (tokensDm.length > 1) {
        this.frasesDm.push({
          texto: dto.damana,
          tokens: tokensDm.map((t) => t.normalizada),
          entrada,
        });
      }
    }
    this.clavesEs = [...this.normalizadaEs.keys()].sort();
    this.clavesDm = [...this.normalizadaDm.keys()].sort();
  }

  /**
   * Acepciones para cada palabra del texto, en el orden del texto. Para
   * cada palabra se prueba la cadena exacta → sin tildes → singular →
   * prefijo, y se para en el primer paso que encuentra algo. Las entradas
   * de varias palabras se incluyen cuando todas sus palabras están en el
   * texto.
   */
  buscar(texto: string, idioma: Idioma): AcepcionEncontrada[] {
    const tokens = tokenizarDamana(texto);
    const presentes = new Set(tokens.map((t) => t.normalizada));
    const resultado: AcepcionEncontrada[] = [];
    const vistas = new Set<string>();

    const emitir: Emisor = (palabra, entradas, coincidencia) => {
      for (const e of entradas) {
        const clave = `${normalizar(e.espanol)}|${normalizar(e.damana)}`;
        if (vistas.has(clave)) continue;
        vistas.add(clave);
        resultado.push({ palabra, coincidencia, ...e });
      }
    };

    for (const token of tokens) {
      if (idioma === Idioma.espanol) {
        this.buscarPalabraEspanol(token.original, token.normalizada, emitir);
      } else {
        this.buscarPalabraDamana(token.original, token.normalizada, emitir);
      }
    }

    const frases = idioma === Idioma.espanol ? this.frasesEs : this.frasesDm;
    for (const frase of frases) {
      if (frase.tokens.every((t) => presentes.has(t))) {
        emitir(frase.texto, [frase.entrada], 'frase');
      }
    }

    return resultado.slice(0, MAX_ACEPCIONES);
  }

  private buscarPalabraEspanol(original: string, normalizada: string, emitir: Emisor): void {
    const exacta = this.exactaEs.get(original.toLowerCase().normalize('NFC'));
    if (exacta) return emitir(original, exacta, 'exacta');

    const sinTildes = this.normalizadaEs.get(normalizada);
    if (sinTildes) return emitir(original, sinTildes, 'sin_tildes');

    const sinonimos = SINONIMOS_ES[normalizada];
    if (sinonimos) {
      const entradas = sinonimos.flatMap(
        (s) => this.alternativaEs.get(tokenizarDamana(s).map((t) => t.normalizada).join(' ')) ?? [],
      );
      if (entradas.length > 0) return emitir(original, entradas, 'sinonimo');
    }

    // Las palabras gramaticales cortas no se aproximan: «las» → «la» sería
    // ruido, y por prefijo todavía peor.
    if (esStopwordEspanol(normalizada) || normalizada.length < 4) return;

    for (const singular of candidatosSingular(normalizada)) {
      const entradas = this.normalizadaEs.get(singular);
      if (entradas) return emitir(original, entradas, 'singular');
    }

    emitir(original, this.porPrefijo(normalizada, this.clavesEs, this.normalizadaEs), 'posible');
  }

  private buscarPalabraDamana(original: string, normalizada: string, emitir: Emisor): void {
    const exacta = this.normalizadaDm.get(normalizada);
    if (exacta) return emitir(original, exacta, 'exacta');
    if (normalizada.length < 4) return;
    emitir(original, this.porPrefijo(normalizada, this.clavesDm, this.normalizadaDm), 'posible');
  }

  /** Entradas cuya clave comparte las primeras LETRAS_PREFIJO letras. */
  private porPrefijo(
    normalizada: string,
    claves: string[],
    indice: Map<string, Entrada[]>,
  ): Entrada[] {
    if (normalizada.length < LETRAS_PREFIJO) return [];
    const prefijo = normalizada.slice(0, LETRAS_PREFIJO);
    const encontradas: Entrada[] = [];
    for (const clave of claves) {
      if (!clave.startsWith(prefijo)) continue;
      for (const e of indice.get(clave) ?? []) {
        encontradas.push(e);
        if (encontradas.length >= MAX_POSIBLES_POR_PALABRA) return encontradas;
      }
    }
    return encontradas;
  }
}

function agregar(mapa: Map<string, Entrada[]>, clave: string, entrada: Entrada): void {
  const lista = mapa.get(clave);
  if (lista) lista.push(entrada);
  else mapa.set(clave, [entrada]);
}
