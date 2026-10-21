import { normalizar } from '../comun/texto/normalizador';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { FuenteCorpus } from '../consulta/consulta.enums';
import { CorpusRepository } from '../consulta/corpus.repository';
import {
  detectarEntradasDudosas,
  detectarParecidas,
  detectarPolisemia,
  detectarSinonimos,
  detectarTerminaciones,
  detectarVariantes,
  EntradaDudosa,
  EntradaLexica,
  FormaVista,
  GrupoEscritura,
  GrupoPolisemia,
  GrupoSinonimos,
  RaizConocida,
  TerminacionCandidata,
  TokenCorpus,
} from './dudas';

/** Todo lo que conviene aclarar con hablantes, listo para pasar a Excel. */
export interface InformeDudas {
  escritura: GrupoEscritura[];
  sinonimos: GrupoSinonimos[];
  polisemia: GrupoPolisemia[];
  dudosas: EntradaDudosa[];
  terminaciones: TerminacionCandidata[];
}

/** Las oraciones de ejemplo se eligen cortas para que quepan en una celda. */
const LARGO_MAXIMO_EJEMPLO = 160;
const MAXIMO_SIGNIFICADOS = 3;

/**
 * Recorre el corpus importado y arma el informe de dudas. Solo lee: no
 * corrige ni borra nada. Las respuestas de las hablantes se aplican
 * después, a mano o con un paso propio, cuando vuelvan.
 */
export class DudasService {
  constructor(private readonly repo: CorpusRepository) {}

  generar(): InformeDudas {
    const entradas: EntradaLexica[] = this.repo.listarVocabulario().map((v) => ({
      espanol: v.espanol,
      damana: v.damana,
      categoria: v.categoria,
      notas: v.notas,
      fuente: v.fuente,
    }));
    const tokens = this.tokensDelCorpus();
    const formas = this.formasVistas(entradas, tokens);

    const sinonimos = detectarSinonimos(entradas);
    for (const grupo of sinonimos) {
      for (const opcion of grupo.opciones) {
        const partes = tokenizarDamana(opcion.damana);
        opcion.frecuencia =
          partes.length === 1 ? (tokens.get(partes[0].normalizada)?.frecuencia ?? 0) : null;
      }
    }

    return {
      escritura: [...detectarVariantes(formas), ...detectarParecidas(formas)],
      sinonimos,
      polisemia: detectarPolisemia(entradas),
      dudosas: detectarEntradasDudosas(entradas),
      terminaciones: detectarTerminaciones(
        this.raicesConocidas(entradas),
        tokens,
        this.terminacionesConocidas(entradas),
      ),
    };
  }

  /** Cada palabra de oraciones y frases con su frecuencia y una oración corta de ejemplo. */
  private tokensDelCorpus(): Map<string, TokenCorpus> {
    const tokens = new Map<string, TokenCorpus>();
    for (const fuente of [FuenteCorpus.oraciones, FuenteCorpus.frases]) {
      for (const fila of this.repo.textosDe(fuente)) {
        const sirveDeEjemplo =
          fila.estado !== 'revisar' &&
          fila.textoEspanol.trim().length > 0 &&
          fila.textoDamana.length <= LARGO_MAXIMO_EJEMPLO;
        for (const t of tokenizarDamana(fila.textoDamana)) {
          const info = tokens.get(t.normalizada) ?? { frecuencia: 0 };
          info.frecuencia++;
          if (
            sirveDeEjemplo &&
            (!info.ejemplo || fila.textoDamana.length < info.ejemplo.damana.length)
          ) {
            info.ejemplo = { damana: fila.textoDamana.trim(), espanol: fila.textoEspanol.trim() };
          }
          tokens.set(t.normalizada, info);
        }
      }
    }
    return tokens;
  }

  /** Formas del corpus más las del vocabulario y las conjugaciones, con lo que significan. */
  private formasVistas(entradas: EntradaLexica[], tokens: Map<string, TokenCorpus>): FormaVista[] {
    const formas = new Map<string, FormaVista>();
    for (const [forma, info] of tokens) {
      formas.set(forma, { forma, frecuencia: info.frecuencia, significados: [], ejemplo: info.ejemplo });
    }
    const anotar = (damana: string, espanol: string) => {
      const partes = tokenizarDamana(damana);
      if (partes.length !== 1) return;
      const clave = partes[0].normalizada;
      const forma = formas.get(clave) ?? { forma: clave, frecuencia: 0, significados: [] };
      const significado = espanol.trim();
      if (
        significado &&
        forma.significados.length < MAXIMO_SIGNIFICADOS &&
        !forma.significados.includes(significado)
      ) {
        forma.significados.push(significado);
      }
      formas.set(clave, forma);
    };
    for (const e of entradas) anotar(e.damana, e.espanol);
    for (const c of this.repo.listarConjugaciones()) anotar(c.damana, c.espanol);
    return [...formas.values()];
  }

  private raicesConocidas(entradas: EntradaLexica[]): RaizConocida[] {
    const raices: RaizConocida[] = [];
    for (const e of entradas) {
      const partes = tokenizarDamana(e.damana);
      if (partes.length === 1) {
        raices.push({ raiz: partes[0].normalizada, significado: e.espanol.trim() });
      }
    }
    return raices;
  }

  /** Lo que ya sabemos de una terminación: una regla, o una entrada que es esa partícula. */
  private terminacionesConocidas(entradas: EntradaLexica[]): Map<string, string> {
    const conocidas = new Map<string, string>();
    for (const e of entradas) {
      for (const alternativa of e.damana.split('/')) {
        const partes = tokenizarDamana(alternativa);
        if (partes.length === 1 && !conocidas.has(partes[0].normalizada)) {
          conocidas.set(
            partes[0].normalizada,
            `hay una palabra suelta igual: «${e.espanol.trim()}» (puede no tener relación)`,
          );
        }
      }
    }
    for (const regla of this.repo.listarReglas()) {
      const clave = normalizar(regla.forma).replace(/^-+/, '').trim();
      if (clave) conocidas.set(clave, `regla anotada: ${regla.significado ?? ''}`.trim());
    }
    return conocidas;
  }
}
