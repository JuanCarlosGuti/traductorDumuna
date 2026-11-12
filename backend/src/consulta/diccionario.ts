import { normalizar } from '../comun/texto/normalizador';
import { esNegacionEspanol, esStopwordEspanol } from '../comun/texto/stopwords-es';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { Idioma } from './consulta.enums';
import { VocabularioDto } from './dto/consulta.dto';

/**
 * How the sense was found, from most to least reliable:
 *  - exacta: the word as is (same accent).
 *  - sin_tildes: equal after normalizing (mamá = mama).
 *  - sinonimo: colloquial Spanish variant that the vocabulary records
 *    under another word (mamá → madre).
 *  - singular: removing -s / -es from the input word.
 *  - frase: multi-word entry whose words are all in the sentence.
 *  - posible: they share the first 5 letters (it may be another word).
 */
export type TipoCoincidencia =
  | 'exacta'
  | 'sin_tildes'
  | 'sinonimo'
  | 'singular'
  | 'frase'
  | 'posible';

export interface AcepcionEncontrada {
  /** Word of the input sentence that triggered the lookup. */
  palabra: string;
  espanol: string;
  damana: string;
  categoria: string | null;
  notas: string | null;
  coincidencia: TipoCoincidencia;
}

/** Global cap on senses that travel in the prompt. */
export const MAX_ACEPCIONES = 40;
/** Cap on «posible» senses (by prefix) per word. */
export const MAX_POSIBLES_POR_PALABRA = 3;
export const LETRAS_PREFIJO = 5;

/**
 * Colloquial or affectionate Spanish variants (normalized key) that the
 * vocabulary, built from a dictionary, records under the formal
 * word. It is Spanish synonymy, not an invented translation: the
 * Damana word is the same. A short and obvious list on purpose.
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
  /** Verbatim text of the alternative, to show what was recognized. */
  texto: string;
  /** Normalized content tokens (without Spanish stopwords). */
  tokens: string[];
  entrada: Entrada;
}

type Emisor = (palabra: string, entradas: Entrada[], coincidencia: TipoCoincidencia) => void;

/**
 * Variants of the Spanish side of an entry: «Igual, lo mismo» and «Ese o
 * esa» are two senses each; «Cocinera (ave)» is indexed as
 * «cocinera»; «Verb: Hacer» as «hacer». Parentheses are removed because
 * they are clarifications, not part of the word. It splits on «o»/«u» but NOT
 * on «y»: «Madre del agua y peces» is a single thing.
 */
export function alternativasEspanol(espanol: string): string[] {
  return espanol
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^\s*\p{L}+:\s*/u, '')
    .split(/[,;/]|\s[–-]\s|\s[ou]\s/)
    .map((a) => a.replace(/[¿?¡!."]/g, ' ').trim())
    .filter((a) => a.length > 0);
}

/** Singular candidates for a normalized word: flores → flor, casas → casa. */
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
 * Vocabulary index used to resolve each word of a sentence. It is
 * built once (≈1,500 entries) and queried on every translation.
 */
export class IndiceDiccionario {
  private readonly exactaEs = new Map<string, Entrada[]>();
  private readonly normalizadaEs = new Map<string, Entrada[]>();
  private readonly frasesEs: Frase[] = [];
  /** Any complete Spanish alternative (one or several words), normalized. */
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
          // Negations are kept as content: «No quiero» must only
          // come in when the sentence carries the «no». If they were removed as
          // stopwords, the negative form would also show up for «quiero» and the
          // model would receive a negated verb for an affirmative sentence.
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
   * Senses for each word of the text, in text order. For
   * each word it tries the exact string → no accents → singular →
   * prefix, and stops at the first step that finds something. Multi-word
   * entries are included when all their words are in the
   * text.
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

    // Short function words are not approximated: «las» → «la» would be
    // noise, and by prefix even worse.
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

  /** Entries whose key shares the first LETRAS_PREFIJO letters. */
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
