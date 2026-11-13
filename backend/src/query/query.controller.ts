import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { SearchService } from './search.service';
import { CorpusRepository } from './corpus.repository';
import {
  SearchQueryDto,
  WordCardDto,
  PhraseDto,
  FrequencyDto,
  FrequenciesQueryDto,
  SearchResponseDto,
  VocabularyDto,
} from './dto/query.dto';
import { FrequenciesService } from './frequencies.service';
import { WordService } from './word.service';

@ApiTags('query')
@Controller()
export class QueryController {
  constructor(
    private readonly searchService: SearchService,
    private readonly word: WordService,
    private readonly frequencies: FrequenciesService,
    private readonly repo: CorpusRepository,
  ) {}

  @Get('search')
  @ApiOperation({
    summary: 'Concordance of a word',
    description:
      'Each occurrence with its context fragment (±120 characters, cut at a word boundary, the word in <mark>), the parallel text in the other language and the reference. ʉ ≠ u and ñ ≠ n; accents and case are ignored.',
  })
  @ApiOkResponse({ type: SearchResponseDto })
  search(@Query() query: SearchQueryDto): SearchResponseDto {
    return this.searchService.search({
      q: query.q,
      language: query.language,
      source: query.source,
      limit: query.limit,
    });
  }

  @Get('word/:token')
  @ApiOperation({
    summary: 'Card for a Damana word',
    description:
      'Total frequency and by source, first 10 concordances and the 10 Spanish words that co-occur most in the parallel texts (candidate translations, without stopwords).',
  })
  @ApiParam({ name: 'token', example: 'nʉnka' })
  @ApiOkResponse({ type: WordCardDto })
  @ApiNotFoundResponse({ description: 'The word does not appear in the corpus' })
  buildWordCard(@Param('token') token: string): WordCardDto {
    return this.word.wordCard(token);
  }

  @Get('frequencies')
  @ApiOperation({
    summary: 'Damana words by descending frequency',
    description:
      'Excludes probable proper names (heuristic: tokens that only appear with an initial capital in the originals).',
  })
  @ApiOkResponse({ type: [FrequencyDto] })
  listFrequencies(@Query() query: FrequenciesQueryDto): FrequencyDto[] {
    return this.frequencies.listAll(query.limit);
  }

  @Get('vocabulary')
  @ApiOperation({ summary: 'Full vocabulary listing' })
  @ApiOkResponse({ type: [VocabularyDto] })
  listVocabulary(): VocabularyDto[] {
    return this.repo.listVocabulary();
  }

  @Get('phrases')
  @ApiOperation({ summary: 'Full phrase listing' })
  @ApiOkResponse({ type: [PhraseDto] })
  listPhrases(): PhraseDto[] {
    return this.repo.listPhrases();
  }
}
