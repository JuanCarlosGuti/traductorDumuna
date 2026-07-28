import { Injectable } from '@nestjs/common';
import { normalizar } from '../comun/texto/normalizador';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { FuenteCorpus, Idioma } from './consulta.enums';
import { CorpusRepository } from './corpus.repository';

export const K_FRAGMENTOS = 8;

/**
 * Los ejemplos que aparecen solo por parentesco verbal (otra persona del
 * mismo lema) valen menos que una coincidencia directa: son útiles, pero
 * usan una conjugación distinta a la que se preguntó.
 */
export const PESO_LEMA = 0.6;

/**
 * Tope de formas hermanas que se añaden a la consulta por cada verbo
 * detectado. «tener» tiene 72 formas: meterlas todas ahogaría una consulta
 * de tres palabras.
 */
export const MAX_FORMAS_HERMANAS = 8;

/**
 * Pares cuyo lado damana es idéntico al español: en el corpus son
 * referencias bíblicas («Génesis 1:27-31; Salmo 115:16.») y nombres propios
 * sueltos («Felipe»). No son ejemplos de lengua —no enseñan ni léxico ni
 * estructura— así que compiten por un hueco entre los K sin aportar nada.
 *
 * Solo se excluyen del índice de retrieval: siguen en el CSV, en la base y
 * en la búsqueda/concordancia.
 */
export function esParSinTraduccion(damana: string, espanol: string): boolean {
  const ladoDamana = normalizar(damana.trim());
  return ladoDamana.length > 0 && ladoDamana === normalizar(espanol.trim());
}

/** Las oraciones con alineación dudosa (estado='revisar') participan en el
 *  retrieval pero con la mitad del puntaje de similitud. */
export const PESO_REVISAR = 0.5;

const FUENTES_RETRIEVAL: FuenteCorpus[] = [
  FuenteCorpus.oraciones,
  FuenteCorpus.frases,
  FuenteCorpus.conjugaciones,
];

export interface FragmentoCorpus {
  fuente: FuenteCorpus;
  id: number;
  referencia: string;
  damana: string;
  espanol: string;
  /** 1 para fragmentos confiables; PESO_REVISAR para oraciones 'revisar'. */
  peso: number;
}

export interface FragmentoRecuperado extends FragmentoCorpus {
  puntaje: number;
  /**
   * Presente cuando el fragmento se recuperó gracias a otra forma del mismo
   * verbo: contiene el lema, para poder advertir que la conjugación difiere.
   */
  porLema?: string;
}

/**
 * Índice TF-IDF mínimo (implementación propia, sin dependencias):
 * tf = conteo del término en el documento, idf = ln(1 + N/(1+df)),
 * similitud = coseno entre vectores tf·idf.
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

  /** Similitud coseno de la consulta con cada documento (0 si no comparten términos). */
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
  /** Forma conjugada (normalizada) → lema al que pertenece. */
  lemaDeForma: Map<string, string>;
  /** Lema → otras formas suyas que SÍ aparecen en el corpus. */
  formasDelLema: Map<string, string[]>;
}

@Injectable()
export class RetrievalService {
  private indices?: Indices;

  constructor(private readonly repo: CorpusRepository) {}

  /**
   * Los K fragmentos del corpus más similares al texto, por TF-IDF sobre
   * tokens normalizados del idioma indicado. Fuentes: oraciones (pares
   * alineados frase a frase), frases y conjugaciones. Las oraciones con
   * estado='revisar' participan con la mitad del puntaje.
   */
  similares(texto: string, idioma: Idioma, k = K_FRAGMENTOS): FragmentoRecuperado[] {
    const indices = this.obtenerIndices();
    const tokens = tokenizarDamana(texto).map((t) => t.normalizada);
    const directa = this.puntuar(tokens, idioma, indices);

    // Segunda pasada: si la consulta trae formas verbales, se repite la
    // búsqueda añadiendo las otras personas del mismo lema. Solo en damana,
    // que es donde los lemas relacionan formas.
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

    const expandida = this.puntuar(
      [...tokens, ...hermanas.keys()],
      idioma,
      indices,
    );
    return this.mejores(this.fusionar(directa, expandida, hermanas, indices), k);
  }

  private puntuar(
    tokens: string[],
    idioma: Idioma,
    indices: Indices,
  ): number[] {
    return indices.porIdioma[idioma]
      .similitudes(tokens)
      .map((similitud, i) => similitud * indices.fragmentos[i].peso);
  }

  /**
   * Otras formas del mismo verbo que aparecen en la consulta, limitadas a
   * las que existen en el corpus (el resto solo añadiría ruido). Devuelve
   * forma → lema, para poder marcar de dónde vino cada ejemplo.
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
   * Cada fragmento se queda con su mejor puntaje: el directo, o el de la
   * búsqueda expandida rebajado por PESO_LEMA. Así una coincidencia real
   * siempre gana a un pariente verbal.
   *
   * Las conjugaciones quedan fuera de la expansión: medido sobre 200
   * consultas reales, se llevaban 55 de los 56 huecos ganados y echaban
   * fuera oraciones. Traer la fila «te lee» cuando se preguntó por «nos
   * lee» no enseña nada —el glosario ya va aparte en el prompt—; lo que
   * aporta es ver el verbo dentro de una oración.
   */
  private fusionar(
    directa: number[],
    expandida: number[],
    hermanas: Map<string, string>,
    indices: Indices,
  ): FragmentoRecuperado[] {
    return indices.fragmentos.map((fragmento, i) => {
      const puntajeLema =
        fragmento.fuente === FuenteCorpus.conjugaciones
          ? 0
          : expandida[i] * PESO_LEMA;
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

  /** Qué verbo hermano contiene este fragmento (para la advertencia). */
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

  private mejores(
    puntuados: FragmentoRecuperado[],
    k: number,
  ): FragmentoRecuperado[] {
    return puntuados
      .filter((f) => f.puntaje > 0)
      .sort((a, b) => b.puntaje - a.puntaje)
      .slice(0, k);
  }

  /**
   * Relaciona cada forma conjugada con su lema y viceversa. Solo se
   * conservan las formas que aparecen de verdad en el corpus: de las 267
   * conjugaciones registradas, la mayoría no sale en ninguna oración, y
   * añadirlas a las consultas sería ruido.
   */
  private construirIndiceDeLemas(
    fragmentos: FragmentoCorpus[],
    tokensDe: (texto: string) => string[],
  ): Pick<Indices, 'lemaDeForma' | 'formasDelLema'> {
    const enCorpus = new Set(fragmentos.flatMap((f) => tokensDe(f.damana)));
    const lemaDeForma = new Map<string, string>();
    const formasDelLema = new Map<string, string[]>();

    for (const { lema, damana } of this.repo.formasPorLema()) {
      for (const forma of tokensDe(damana)) {
        // La primera palabra basta: las formas de varias palabras llevan la
        // marca verbal al inicio (p. ej. «nujkunanún nanka»).
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
            id: fila.id,
            referencia: fila.referencia,
            damana: fila.textoDamana,
            espanol: fila.textoEspanol,
            peso: fila.estado === 'revisar' ? PESO_REVISAR : 1,
          });
        }
      }
      const tokensDe = (texto: string) => tokenizarDamana(texto).map((t) => t.normalizada);
      this.indices = {
        fragmentos,
        porIdioma: {
          [Idioma.damana]: new IndiceTfIdf(fragmentos.map((f) => tokensDe(f.damana))),
          [Idioma.espanol]: new IndiceTfIdf(fragmentos.map((f) => tokensDe(f.espanol))),
        },
        ...this.construirIndiceDeLemas(fragmentos, tokensDe),
      };
    }
    return this.indices;
  }
}
