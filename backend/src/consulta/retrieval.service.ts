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

/**
 * Cupos de ejemplos por dominio para el prompt del traductor. Los
 * cotidianos mandan: cuando hay suficientes, los bíblicos bajan a 2 para
 * que el registro religioso no arrastre la traducción.
 */
export const CUPO_COTIDIANO = 6;
export const CUPO_GRAMATICA = 4;
export const CUPO_BIBLICO = 4;
export const CUPO_BIBLICO_REDUCIDO = 2;
export const COTIDIANOS_SUFICIENTES = 4;
export const MAX_EJEMPLOS = 14;
/** Candidatos que se piden al TF-IDF antes de repartir por dominio. */
export const CANDIDATOS_CONTEXTO = 60;
/** Jaccard de tokens damana a partir del cual dos ejemplos son «casi iguales». */
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

export interface NombrePropioEncontrado {
  /** Cómo venía escrito en la frase de entrada. */
  enTexto: string;
  espanol: string;
  damana: string;
}

/** Todo lo que el traductor necesita saber del corpus sobre una frase. */
export interface ContextoRecuperado {
  diccionario: AcepcionEncontrada[];
  nombresPropios: NombrePropioEncontrado[];
  disparadores: Disparador[];
  reglas: ReglaGramatical[];
  ejemplos: FragmentoRecuperado[];
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
 * Dos ejemplos son «casi iguales» cuando uno de los lados coincide tras
 * normalizar o cuando el damana comparte casi todas las palabras (una
 * misma oración con una coma de diferencia). Repetirlos solo gasta hueco.
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
 * Reparte los candidatos (ya puntuados) por dominio con los cupos del
 * prompt: hasta 6 cotidianos, 4 de gramática y 4 bíblicos —2 si ya hay
 * cotidianos suficientes—, sin repetir casi iguales y nunca más de 14.
 * Devuelve primero los cotidianos, luego gramática y por último bíblicos,
 * cada grupo de mayor a menor similitud.
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
   * Contexto completo para traducir una frase, en este orden: diccionario
   * palabra por palabra, nombres propios con su grafía, reglas aplicables
   * y ejemplos por similitud repartidos por dominio.
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

  /** Ejemplos por similitud con cupos por dominio y sin casi-duplicados. */
  ejemplosPorDominio(texto: string, idioma: Idioma): FragmentoRecuperado[] {
    return repartirPorDominio(this.similares(texto, idioma, CANDIDATOS_CONTEXTO));
  }

  /**
   * Nombres propios de la tabla que aparecen en el texto, por cualquiera de
   * sus grafías (español, damana u «otras grafías vistas»), sin distinguir
   * tildes ni mayúsculas.
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
   * Los K fragmentos del corpus más similares al texto, por TF-IDF sobre
   * tokens normalizados del idioma indicado. Fuentes: oraciones (pares
   * alineados frase a frase), frases y conjugaciones. Las oraciones con
   * estado='revisar' participan con la mitad del puntaje.
   */
  similares(texto: string, idioma: Idioma, k = K_FRAGMENTOS): FragmentoRecuperado[] {
    const indices = this.obtenerIndices();
    const tokens = tokensNormalizados(texto);
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

    const expandida = this.puntuar([...tokens, ...hermanas.keys()], idioma, indices);
    return this.mejores(this.fusionar(directa, expandida, hermanas, indices), k);
  }

  private puntuar(tokens: string[], idioma: Idioma, indices: Indices): number[] {
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

  private mejores(puntuados: FragmentoRecuperado[], k: number): FragmentoRecuperado[] {
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
  ): Pick<Indices, 'lemaDeForma' | 'formasDelLema'> {
    const enCorpus = new Set(fragmentos.flatMap((f) => tokensNormalizados(f.damana)));
    const lemaDeForma = new Map<string, string>();
    const formasDelLema = new Map<string, string[]>();

    for (const { lema, damana } of this.repo.formasPorLema()) {
      for (const forma of tokensNormalizados(damana)) {
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
