import { Injectable } from '@nestjs/common';
import {
  findOccurrences,
  extractFragment,
  markOccurrences,
  Occurrence,
} from '../comun/texto/concordancia';
import { tokenizeDamana } from '../comun/texto/tokenizador';
import { CorpusSource, Language } from './consulta.enums';
import { CorpusRepository } from './corpus.repository';
import { ConcordanceDto, SearchResponseDto } from './dto/consulta.dto';
import { RetrievalService } from './retrieval.service';

export interface SearchParams {
  q: string;
  idioma: Language;
  fuente?: CorpusSource;
  limite: number;
}

/** In similarity mode more candidates than the limit are fetched so that
 *  the source filter does not leave the response short. */
const SIMILARITY_CANDIDATES = 200;

@Injectable()
export class SearchService {
  constructor(
    private readonly repo: CorpusRepository,
    private readonly retrieval: RetrievalService,
  ) {}

  /**
   * One word → exact concordance (each occurrence with its context).
   * Several words → TF-IDF similarity search over sentences,
   * phrases and conjugations, with the query words highlighted.
   */
  search(params: SearchParams): SearchResponseDto {
    const tokens = tokenizeDamana(params.q);
    return tokens.length >= 2
      ? this.searchBySimilarity(params, tokens.map((t) => t.normalizada))
      : this.searchConcordance(params);
  }

  private searchConcordance(params: SearchParams): SearchResponseDto {
    const sources = params.fuente
      ? [params.fuente]
      : [
          CorpusSource.oraciones,
          CorpusSource.frases,
          CorpusSource.vocabulario,
          CorpusSource.conjugaciones,
        ];

    let total = 0;
    const results: ConcordanceDto[] = [];

    for (const source of sources) {
      for (const row of this.repo.textsOf(source)) {
        const text =
          params.idioma === Language.damana ? row.textoDamana : row.textoEspanol;
        const parallel =
          params.idioma === Language.damana ? row.textoEspanol : row.textoDamana;
        for (const occurrence of findOccurrences(text, params.q)) {
          total++;
          if (results.length < params.limite) {
            results.push({
              fuente: source,
              id: row.id,
              referencia: row.referencia,
              fragmento: extractFragment(text, occurrence),
              textoParalelo: parallel,
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
      resultados: results,
    };
  }

  private searchBySimilarity(
    params: SearchParams,
    queryTokens: string[],
  ): SearchResponseDto {
    const results = this.retrieval
      .similar(params.q, params.idioma, SIMILARITY_CANDIDATES)
      .filter((f) => !params.fuente || f.fuente === params.fuente)
      .slice(0, params.limite)
      .map((f) => {
        const text = params.idioma === Language.damana ? f.damana : f.espanol;
        const parallel = params.idioma === Language.damana ? f.espanol : f.damana;
        return {
          fuente: f.fuente,
          id: f.id,
          referencia: f.referencia,
          fragmento: markOccurrences(text, this.occurrencesOf(text, queryTokens)),
          textoParalelo: parallel,
          puntaje: f.puntaje,
        };
      });

    return {
      consulta: params.q,
      idioma: params.idioma,
      modo: 'similitud',
      total: results.length,
      resultados: results,
    };
  }

  /** Occurrences of each query word within the text. */
  private occurrencesOf(text: string, queryTokens: string[]): Occurrence[] {
    const uniqueWords = [...new Set(queryTokens)];
    return uniqueWords.flatMap((token) => findOccurrences(text, token));
  }
}
