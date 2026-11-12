import { Injectable } from '@nestjs/common';
import {
  buscarOcurrencias,
  extraerFragmento,
  marcarOcurrencias,
  Ocurrencia,
} from '../comun/texto/concordancia';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { FuenteCorpus, Idioma } from './consulta.enums';
import { CorpusRepository } from './corpus.repository';
import { ConcordanciaDto, RespuestaBusquedaDto } from './dto/consulta.dto';
import { RetrievalService } from './retrieval.service';

export interface ParametrosBusqueda {
  q: string;
  idioma: Idioma;
  fuente?: FuenteCorpus;
  limite: number;
}

/** In similarity mode more candidates than the limit are fetched so that
 *  the source filter does not leave the response short. */
const CANDIDATOS_SIMILITUD = 200;

@Injectable()
export class BusquedaService {
  constructor(
    private readonly repo: CorpusRepository,
    private readonly retrieval: RetrievalService,
  ) {}

  /**
   * One word → exact concordance (each occurrence with its context).
   * Several words → TF-IDF similarity search over sentences,
   * phrases and conjugations, with the query words highlighted.
   */
  buscar(params: ParametrosBusqueda): RespuestaBusquedaDto {
    const tokens = tokenizarDamana(params.q);
    return tokens.length >= 2
      ? this.buscarPorSimilitud(params, tokens.map((t) => t.normalizada))
      : this.buscarConcordancia(params);
  }

  private buscarConcordancia(params: ParametrosBusqueda): RespuestaBusquedaDto {
    const fuentes = params.fuente
      ? [params.fuente]
      : [
          FuenteCorpus.oraciones,
          FuenteCorpus.frases,
          FuenteCorpus.vocabulario,
          FuenteCorpus.conjugaciones,
        ];

    let total = 0;
    const resultados: ConcordanciaDto[] = [];

    for (const fuente of fuentes) {
      for (const fila of this.repo.textosDe(fuente)) {
        const texto =
          params.idioma === Idioma.damana ? fila.textoDamana : fila.textoEspanol;
        const paralelo =
          params.idioma === Idioma.damana ? fila.textoEspanol : fila.textoDamana;
        for (const ocurrencia of buscarOcurrencias(texto, params.q)) {
          total++;
          if (resultados.length < params.limite) {
            resultados.push({
              fuente,
              id: fila.id,
              referencia: fila.referencia,
              fragmento: extraerFragmento(texto, ocurrencia),
              textoParalelo: paralelo,
              puntaje: null,
            });
          }
        }
      }
    }

    return {
      consulta: params.q,
      idioma: params.idioma,
      modo: 'concordancia',
      total,
      resultados,
    };
  }

  private buscarPorSimilitud(
    params: ParametrosBusqueda,
    tokensConsulta: string[],
  ): RespuestaBusquedaDto {
    const resultados = this.retrieval
      .similares(params.q, params.idioma, CANDIDATOS_SIMILITUD)
      .filter((f) => !params.fuente || f.fuente === params.fuente)
      .slice(0, params.limite)
      .map((f) => {
        const texto = params.idioma === Idioma.damana ? f.damana : f.espanol;
        const paralelo = params.idioma === Idioma.damana ? f.espanol : f.damana;
        return {
          fuente: f.fuente,
          id: f.id,
          referencia: f.referencia,
          fragmento: marcarOcurrencias(texto, this.ocurrenciasDe(texto, tokensConsulta)),
          textoParalelo: paralelo,
          puntaje: f.puntaje,
        };
      });

    return {
      consulta: params.q,
      idioma: params.idioma,
      modo: 'similitud',
      total: resultados.length,
      resultados,
    };
  }

  /** Occurrences of each query word within the text. */
  private ocurrenciasDe(texto: string, tokensConsulta: string[]): Ocurrencia[] {
    const unicas = [...new Set(tokensConsulta)];
    return unicas.flatMap((token) => buscarOcurrencias(texto, token));
  }
}
