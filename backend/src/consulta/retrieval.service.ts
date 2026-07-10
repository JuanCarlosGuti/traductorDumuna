import { Injectable } from '@nestjs/common';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { FuenteCorpus, Idioma } from './consulta.enums';
import { CorpusRepository } from './corpus.repository';

export const K_FRAGMENTOS = 8;

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
    const { fragmentos, porIdioma } = this.obtenerIndices();
    const tokens = tokenizarDamana(texto).map((t) => t.normalizada);
    return porIdioma[idioma]
      .similitudes(tokens)
      .map((similitud, indice) => ({
        ...fragmentos[indice],
        puntaje: similitud * fragmentos[indice].peso,
      }))
      .filter((f) => f.puntaje > 0)
      .sort((a, b) => b.puntaje - a.puntaje)
      .slice(0, k);
  }

  private obtenerIndices(): Indices {
    if (!this.indices) {
      const fragmentos: FragmentoCorpus[] = [];
      for (const fuente of FUENTES_RETRIEVAL) {
        for (const fila of this.repo.textosDe(fuente)) {
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
      };
    }
    return this.indices;
  }
}
