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

@ApiTags('consulta')
@Controller()
export class QueryController {
  constructor(
    private readonly searchService: SearchService,
    private readonly word: WordService,
    private readonly frequencies: FrequenciesService,
    private readonly repo: CorpusRepository,
  ) {}

  @Get('buscar')
  @ApiOperation({
    summary: 'Concordancia de una palabra',
    description:
      'Cada ocurrencia con su fragmento de contexto (±120 caracteres, cortando en límite de palabra, la palabra en <mark>), el texto paralelo del otro idioma y la referencia. ʉ ≠ u y ñ ≠ n; tildes y mayúsculas se ignoran.',
  })
  @ApiOkResponse({ type: SearchResponseDto })
  search(@Query() query: SearchQueryDto): SearchResponseDto {
    return this.searchService.search({
      q: query.q,
      idioma: query.idioma,
      fuente: query.fuente,
      limite: query.limite,
    });
  }

  @Get('palabra/:token')
  @ApiOperation({
    summary: 'Ficha de una palabra damana',
    description:
      'Frecuencia total y por fuente, primeras 10 concordancias y las 10 palabras españolas que más co-ocurren en los textos paralelos (traducciones candidatas, sin stopwords).',
  })
  @ApiParam({ name: 'token', example: 'nʉnka' })
  @ApiOkResponse({ type: WordCardDto })
  @ApiNotFoundResponse({ description: 'La palabra no aparece en el corpus' })
  buildWordCard(@Param('token') token: string): WordCardDto {
    return this.word.wordCard(token);
  }

  @Get('frecuencias')
  @ApiOperation({
    summary: 'Palabras damana por frecuencia descendente',
    description:
      'Excluye probables nombres propios (heurística: tokens que solo aparecen con mayúscula inicial en los originales).',
  })
  @ApiOkResponse({ type: [FrequencyDto] })
  listFrequencies(@Query() query: FrequenciesQueryDto): FrequencyDto[] {
    return this.frequencies.listAll(query.limite);
  }

  @Get('vocabulario')
  @ApiOperation({ summary: 'Listado completo del vocabulario' })
  @ApiOkResponse({ type: [VocabularyDto] })
  listVocabulary(): VocabularyDto[] {
    return this.repo.listVocabulary();
  }

  @Get('frases')
  @ApiOperation({ summary: 'Listado completo de las frases' })
  @ApiOkResponse({ type: [PhraseDto] })
  listPhrases(): PhraseDto[] {
    return this.repo.listPhrases();
  }
}
