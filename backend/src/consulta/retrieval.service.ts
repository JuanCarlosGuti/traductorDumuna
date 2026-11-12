import { Injectable } from '@nestjs/common';
import { normalizar } from '../comun/texto/normalizador';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { DominioCorpus, FuenteCorpus, Idioma } from './consulta.enums';
import { CorpusRepository } from './corpus.repository';
import { AcepcionEncontrada, IndiceDiccionario } from './diccionario';
import { NombrePropioDto } from './dto/consulta.dto';
import { Disparador, ReglaGramatical, seleccionarReglas } from './reglas';

export const K_FRAGMENTOS = 8;

/**
 * Examples that appear only through verbal kinship (another person of the
 * same lemma) are worth less than a direct match: they are useful, but
 * use a different conjugation from the one that was asked about.
 */
export const PESO_LEMA = 0.6;

/**
 * Cap on sibling forms added to the query for each detected
 * verb. «tener» has 72 forms: adding them all would drown a three-word
 * query.
 */
export const MAX_FORMAS_HERMANAS = 8;

/**
 * Pairs whose Damana side is identical to the Spanish one: in the corpus they are
 * biblical references («Génesis 1:27-31; Salmo 115:16.») and loose proper
 * names («Felipe»). They are not language examples — they teach neither lexicon nor
 * structure — so they compete for a slot among the K without contributing anything.
 *
 * They are only excluded from the retrieval index: they stay in the CSV, in the database and
 * in search/concordance.
 */
export function esParSinTraduccion(damana: string, espanol: string): boolean {
  const ladoDamana = normalizar(damana.trim());
  return ladoDamana.length > 0 && ladoDamana === normalizar(espanol.trim());
}

/** Sentences with doubtful alignment (estado='revisar') take part in
 *  retrieval but with half the similarity score. */
export const PESO_REVISAR = 0.5;

/**
 * Example quotas per domain for the translator prompt. Everyday
 * ones take priority: when there are enough, biblical ones drop to 2 so
 * that the religious register does not drag the translation along.
 */
export const CUPO_COTIDIANO = 6;
export const CUPO_GRAMATICA = 4;
export const CUPO_BIBLICO = 4;
export const CUPO_BIBLICO_REDUCIDO = 2;
export const COTIDIANOS_SUFICIENTES = 4;
export const MAX_EJEMPLOS = 14;
/** Candidates requested from TF-IDF before splitting by domain. */
export const CANDIDATOS_CONTEXTO = 60;
/** Jaccard of Damana tokens above which two examples are «almost equal». */
export const UMBRAL_CASI_IGUAL = 0.8;

const FUENTES_RETRIEVAL: FuenteCorpus[] = [
  FuenteCorpus.oraciones,
  FuenteCorpus.frases,
  FuenteCorpus.conjugaciones,
];

export interface FragmentoCorpus {
  fuente: FuenteCorpus;
  dominio: DominioCorpus;
  id: number;
  referencia: string;
  damana: string;
  espanol: string;
  /** 1 for reliable fragments; PESO_REVISAR for 'revisar' sentences. */
  peso: number;
}

export interface FragmentoRecuperado extends FragmentoCorpus {
  puntaje: number;
  /**
   * Present when the fragment was retrieved thanks to another form of the same
   * verb: it holds the lemma, so we can warn that the conjugation differs.
   */
  porLema?: string;
}

export interface NombrePropioEncontrado {
  /** How it was written in the input sentence. */
  enTexto: string;
  espanol: string;
  damana: string;
}

/** Everything the translator needs to know from the corpus about a sentence. */
export interface ContextoRecuperado {
  diccionario: AcepcionEncontrada[];
  nombresPropios: NombrePropioEncontrado[];
  disparadores: Disparador[];
  reglas: ReglaGramatical[];
  ejemplos: FragmentoRecuperado[];
}

/**
 * Minimal TF-IDF index (own implementation, no dependencies):
 * tf = count of the term in the document, idf = ln(1 + N/(1+df)),
 * similarity = cosine between tf·idf vectors.
 */
class IndiceTfIdf {
  private readonly idf = new Map<string, number>();
  private readonly vectores: { pesos: Map<string, number>; norma: number }[] = [];

  constructor(tokensPorDocumento: string[][]) {
    const n = tokensPorDocumento.length;
    const df = new Map<string, number>();
    for (const tokens of tokensPorDocumento) {
      for (const termino of new Set(tokens)) {
        df.set(termino, (df.get(termino) ?? 0) + 1);
      }
    }
    for (const [termino, frecuencia] of df) {
      this.idf.set(termino, Math.log(1 + n / (1 + frecuencia)));
    }
    for (const tokens of tokensPorDocumento) {
      const pesos = this.vectorizar(tokens);
      let suma = 0;
      for (const peso of pesos.values()) suma += peso * peso;
      this.vectores.push({ pesos, norma: Math.sqrt(suma) });
    }
  }

  private vectorizar(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
    const pesos = new Map<string, number>();
    for (const [termino, frecuencia] of tf) {
      const idf = this.idf.get(termino);
      if (idf !== undefined) pesos.set(termino, frecuencia * idf);
    }
    return pesos;
  }

  /** Cosine similarity of the query with each document (0 if they share no terms). */
  similitudes(tokensConsulta: string[]): number[] {
    const consulta = this.vectorizar(tokensConsulta);
    let normaConsulta = 0;
    for (const peso of consulta.values()) normaConsulta += peso * peso;
    normaConsulta = Math.sqrt(normaConsulta);
    if (normaConsulta === 0) return this.vectores.map(() => 0);

    return this.vectores.map(({ pesos, norma }) => {
      if (norma === 0) return 0;
      let producto = 0;
      for (const [termino, peso] of consulta) {
        const pesoDoc = pesos.get(termino);
        if (pesoDoc !== undefined) producto += peso * pesoDoc;
      }
      return producto / (norma * normaConsulta);
    });
  }
}

interface Indices {
  fragmentos: FragmentoCorpus[];
  porIdioma: Record<Idioma, IndiceTfIdf>;
  /** Conjugated form (normalized) → lemma it belongs to. */
  lemaDeForma: Map<string, string>;
  /** Lemma → its other forms that DO appear in the corpus. */
  formasDelLema: Map<string, string[]>;
}

const tokensNormalizados = (texto: string): string[] =>
  tokenizarDamana(texto).map((t) => t.normalizada);

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let interseccion = 0;
  for (const x of A) if (B.has(x)) interseccion++;
  return interseccion / (A.size + B.size - interseccion);
}

/**
 * Two examples are «almost equal» when one of the sides matches after
 * normalizing or when the Damana shares almost all the words (the
 * same sentence with one comma of difference). Repeating them only wastes a slot.
 */
export function esCasiIgual(
  a: { damana: string; espanol: string },
  b: { damana: string; espanol: string },
): boolean {
  if (normalizar(a.damana.trim()) === normalizar(b.damana.trim())) return true;
  const espA = normalizar(a.espanol.trim());
  if (espA.length > 0 && espA === normalizar(b.espanol.trim())) return true;
  return jaccard(tokensNormalizados(a.damana), tokensNormalizados(b.damana)) >= UMBRAL_CASI_IGUAL;
}

/**
 * Splits the (already scored) candidates by domain with the prompt's
 * quotas: up to 6 everyday, 4 grammar and 4 biblical — 2 if there are already
 * enough everyday ones — without repeating near-duplicates and never more than 14.
 * Returns everyday ones first, then grammar and finally biblical,
 * each group from highest to lowest similarity.
 */
export function repartirPorDominio(candidatos: FragmentoRecuperado[]): FragmentoRecuperado[] {
  const ordenados = [...candidatos].sort((a, b) => b.puntaje - a.puntaje);
  const unicos: FragmentoRecuperado[] = [];
  for (const candidato of ordenados) {
    if (!unicos.some((u) => esCasiIgual(u, candidato))) unicos.push(candidato);
  }
  const del = (dominio: DominioCorpus, cupo: number) =>
    unicos.filter((f) => f.dominio === dominio).slice(0, cupo);

  const cotidianos = del(DominioCorpus.cotidiano, CUPO_COTIDIANO);
  const gramatica = del(DominioCorpus.gramatica, CUPO_GRAMATICA);
  const cupoBiblico =
    cotidianos.length >= COTIDIANOS_SUFICIENTES ? CUPO_BIBLICO_REDUCIDO : CUPO_BIBLICO;
  const biblicos = del(DominioCorpus.biblico, cupoBiblico);
  return [...cotidianos, ...gramatica, ...biblicos].slice(0, MAX_EJEMPLOS);
}

@Injectable()
export class RetrievalService {
  private indices?: Indices;
  private diccionario?: IndiceDiccionario;
  private reglas?: ReglaGramatical[];
  private nombresPropios?: NombrePropioDto[];

  constructor(private readonly repo: CorpusRepository) {}

  /**
   * Full context for translating a sentence, in this order: word-by-word
   * dictionary, proper names with their spelling, applicable rules
   * and similarity examples split by domain.
   */
  recuperarContexto(texto: string, idioma: Idioma): ContextoRecuperado {
    const seleccion = seleccionarReglas(texto, idioma, this.obtenerReglas());
    return {
      diccionario: this.obtenerDiccionario().buscar(texto, idioma),
      nombresPropios: this.nombresPropiosEn(texto),
      disparadores: seleccion.disparadores,
      reglas: seleccion.reglas,
      ejemplos: this.ejemplosPorDominio(texto, idioma),
    };
  }

  /** Similarity examples with per-domain quotas and no near-duplicates. */
  ejemplosPorDominio(texto: string, idioma: Idioma): FragmentoRecuperado[] {
    return repartirPorDominio(this.similares(texto, idioma, CANDIDATOS_CONTEXTO));
  }

  /**
   * Proper names from the table that appear in the text, under any of
   * their spellings (Spanish, Damana or «other spellings seen»), ignoring
   * accents and capitals.
   */
  nombresPropiosEn(texto: string): NombrePropioEncontrado[] {
    const nombres = this.obtenerNombresPropios();
    const encontrados: NombrePropioEncontrado[] = [];
    const vistos = new Set<string>();
    for (const token of tokenizarDamana(texto)) {
      for (const nombre of nombres) {
        const grafias = [nombre.espanol, nombre.damana, ...nombre.otrasGrafias].map(normalizar);
        if (!grafias.includes(token.normalizada) || vistos.has(nombre.damana)) continue;
        vistos.add(nombre.damana);
        encontrados.push({ enTexto: token.original, espanol: nombre.espanol, damana: nombre.damana });
      }
    }
    return encontrados;
  }

  /**
   * The K corpus fragments most similar to the text, by TF-IDF over
   * normalized tokens of the given language. Sources: sentences (pairs
   * aligned sentence by sentence), phrases and conjugations. Sentences with
   * estado='revisar' take part with half the score.
   */
  similares(texto: string, idioma: Idioma, k = K_FRAGMENTOS): FragmentoRecuperado[] {
    const indices = this.obtenerIndices();
    const tokens = tokensNormalizados(texto);
    const directa = this.puntuar(tokens, idioma, indices);

    // Second pass: if the query carries verb forms, the search is
    // repeated adding the other persons of the same lemma. Only in Damana,
    // which is where lemmas relate forms.
    const hermanas =
      idioma === Idioma.damana
        ? this.formasHermanas(tokens, indices)
        : new Map<string, string>();
    if (hermanas.size === 0) {
      const soloDirecta = indices.fragmentos.map((fragmento, i) => ({
        ...fragmento,
        puntaje: directa[i],
      }));
      return this.mejores(soloDirecta, k);
    }

    const expandida = this.puntuar([...tokens, ...hermanas.keys()], idioma, indices);
    return this.mejores(this.fusionar(directa, expandida, hermanas, indices), k);
  }

  private puntuar(tokens: string[], idioma: Idioma, indices: Indices): number[] {
    return indices.porIdioma[idioma]
      .similitudes(tokens)
      .map((similitud, i) => similitud * indices.fragmentos[i].peso);
  }

  /**
   * Other forms of the same verb that appear in the query, limited to
   * those that exist in the corpus (the rest would only add noise). Returns
   * form → lemma, to be able to mark where each example came from.
   */
  private formasHermanas(tokens: string[], indices: Indices): Map<string, string> {
    const hermanas = new Map<string, string>();
    const enConsulta = new Set(tokens);
    for (const token of tokens) {
      const lema = indices.lemaDeForma.get(token);
      if (!lema) continue;
      const formas = (indices.formasDelLema.get(lema) ?? [])
        .filter((f) => !enConsulta.has(f))
        .slice(0, MAX_FORMAS_HERMANAS);
      for (const forma of formas) hermanas.set(forma, lema);
    }
    return hermanas;
  }

  /**
   * Each fragment keeps its best score: the direct one, or the one from the
   * expanded search discounted by PESO_LEMA. That way a real match
   * always beats a verbal relative.
   *
   * Conjugations are left out of the expansion: measured over 200
   * real queries, they took 55 of the 56 slots gained and pushed
   * sentences out. Bringing the «te lee» row when the question was about «nos
   * lee» teaches nothing — the glossary already goes separately in the prompt —; what
   * helps is seeing the verb inside a sentence.
   */
  private fusionar(
    directa: number[],
    expandida: number[],
    hermanas: Map<string, string>,
    indices: Indices,
  ): FragmentoRecuperado[] {
    return indices.fragmentos.map((fragmento, i) => {
      const puntajeLema =
        fragmento.fuente === FuenteCorpus.conjugaciones ? 0 : expandida[i] * PESO_LEMA;
      if (puntajeLema > directa[i]) {
        return {
          ...fragmento,
          puntaje: puntajeLema,
          porLema: this.lemaPresenteEn(fragmento, hermanas),
        };
      }
      return { ...fragmento, puntaje: directa[i] };
    });
  }

  /** Which sibling verb this fragment contains (for the warning). */
  private lemaPresenteEn(
    fragmento: FragmentoCorpus,
    hermanas: Map<string, string>,
  ): string | undefined {
    for (const token of tokenizarDamana(fragmento.damana)) {
      const lema = hermanas.get(token.normalizada);
      if (lema) return lema;
    }
    return undefined;
  }

  private mejores(puntuados: FragmentoRecuperado[], k: number): FragmentoRecuperado[] {
    return puntuados
      .filter((f) => f.puntaje > 0)
      .sort((a, b) => b.puntaje - a.puntaje)
      .slice(0, k);
  }

  /**
   * Relates each conjugated form to its lemma and vice versa. Only
   * forms that really appear in the corpus are kept: of the 267
   * recorded conjugations, most do not show up in any sentence, and
   * adding them to the queries would be noise.
   */
  private construirIndiceDeLemas(
    fragmentos: FragmentoCorpus[],
  ): Pick<Indices, 'lemaDeForma' | 'formasDelLema'> {
    const enCorpus = new Set(fragmentos.flatMap((f) => tokensNormalizados(f.damana)));
    const lemaDeForma = new Map<string, string>();
    const formasDelLema = new Map<string, string[]>();

    for (const { lema, damana } of this.repo.formasPorLema()) {
      for (const forma of tokensNormalizados(damana)) {
        // The first word is enough: multi-word forms carry the
        // verbal marker at the start (e.g. «nujkunanún nanka»).
        if (!lemaDeForma.has(forma)) lemaDeForma.set(forma, lema);
        if (!enCorpus.has(forma)) continue;
        const formas = formasDelLema.get(lema) ?? [];
        if (!formas.includes(forma)) formas.push(forma);
        formasDelLema.set(lema, formas);
        break;
      }
    }
    return { lemaDeForma, formasDelLema };
  }

  private obtenerIndices(): Indices {
    if (!this.indices) {
      const fragmentos: FragmentoCorpus[] = [];
      for (const fuente of FUENTES_RETRIEVAL) {
        for (const fila of this.repo.textosDe(fuente)) {
          if (esParSinTraduccion(fila.textoDamana, fila.textoEspanol)) continue;
          fragmentos.push({
            fuente,
            dominio: fila.dominio,
            id: fila.id,
            referencia: fila.referencia,
            damana: fila.textoDamana,
            espanol: fila.textoEspanol,
            peso: fila.estado === 'revisar' ? PESO_REVISAR : 1,
          });
        }
      }
      this.indices = {
        fragmentos,
        porIdioma: {
          [Idioma.damana]: new IndiceTfIdf(fragmentos.map((f) => tokensNormalizados(f.damana))),
          [Idioma.espanol]: new IndiceTfIdf(fragmentos.map((f) => tokensNormalizados(f.espanol))),
        },
        ...this.construirIndiceDeLemas(fragmentos),
      };
    }
    return this.indices;
  }

  private obtenerDiccionario(): IndiceDiccionario {
    if (!this.diccionario) {
      this.diccionario = new IndiceDiccionario(this.repo.listarVocabulario());
    }
    return this.diccionario;
  }

  private obtenerReglas(): ReglaGramatical[] {
    if (!this.reglas) this.reglas = this.repo.listarReglas();
    return this.reglas;
  }

  private obtenerNombresPropios(): NombrePropioDto[] {
    if (!this.nombresPropios) this.nombresPropios = this.repo.listarNombresPropios();
    return this.nombresPropios;
  }
}
