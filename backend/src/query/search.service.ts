import { Injectable } from '@nestjs/common';
import {
  findOccurrences,
  extractFragment,
  markOccurrences,
  Occurrence,
} from '../common/text/concordance';
import { tokenizeDamana } from '../common/text/tokenizer';
import { CorpusSource, Language } from './query.enums';
import { CorpusRepository } from './corpus.repository';
import { ConcordanceDto, SearchResponseDto } from './dto/query.dto';
import { RetrievalService } from './retrieval.service';

export interface SearchParams {
  q: string;
  language: Language;
  source?: CorpusSource;
  limit: number;
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
      ? this.searchBySimilarity(params, tokens.map((t) => t.normalized))
      : this.searchConcordance(params);
  }

  private searchConcordance(params: SearchParams): SearchResponseDto {
    const sources = params.source
      ? [params.source]
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
          params.language === Language.damana ? row.damanaText : row.spanishText;
        const parallel =
          params.language === Language.damana ? row.spanishText : row.damanaText;
        for (const occurrence of findOccurrences(text, params.q)) {
          total++;
          if (results.length < params.limit) {
            results.push({
              source: source,
              id: row.id,
              reference: row.reference,
              fragment: extractFragment(text, occurrence),
              parallelText: parallel,
              score: null,
            });
          }
        }
      }
    }

    return {
      query: params.q,
      language: params.language,
      mode: 'concordancia',
      total,
      results: results,
    };
  }

  private searchBySimilarity(
    params: SearchParams,
    queryTokens: string[],
  ): SearchResponseDto {
    const results = this.retrieval
      .similar(params.q, params.language, SIMILARITY_CANDIDATES)
      .filter((f) => !params.source || f.source === params.source)
      .slice(0, params.limit)
      .map((f) => {
        const text = params.language === Language.damana ? f.damana : f.spanish;
        const parallel = params.language === Language.damana ? f.spanish : f.damana;
        return {
          source: f.source,
          id: f.id,
          reference: f.reference,
          fragment: markOccurrences(text, this.occurrencesOf(text, queryTokens)),
          parallelText: parallel,
          score: f.score,
        };
      });

    return {
      query: params.q,
      language: params.language,
      mode: 'similitud',
      total: results.length,
      results: results,
    };
  }

  /** Occurrences of each query word within the text. */
  private occurrencesOf(text: string, queryTokens: string[]): Occurrence[] {
    const uniqueWords = [...new Set(queryTokens)];
    return uniqueWords.flatMap((token) => findOccurrences(text, token));
  }
}
