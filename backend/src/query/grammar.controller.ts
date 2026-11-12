import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { LemmaDto, ConjugationTableDto } from './dto/query.dto';
import { GrammarService } from './grammar.service';

@ApiTags('gramatica')
@Controller('gramatica')
export class GrammarController {
  constructor(private readonly grammar: GrammarService) {}

  @Get('lemas')
  @ApiOperation({ summary: 'Lemas verbales con conjugaciones en el corpus' })
  @ApiOkResponse({ type: [LemmaDto] })
  lemmas(): LemmaDto[] {
    return this.grammar.lemmas();
  }

  @Get('lemas/:lema')
  @ApiOperation({ summary: 'Tabla de conjugación de un lema (forma damana, glosa, notas)' })
  @ApiParam({ name: 'lema', example: 'tener' })
  @ApiOkResponse({ type: ConjugationTableDto })
  @ApiNotFoundResponse({ description: 'Lema sin conjugaciones en el corpus' })
  table(@Param('lema') lemma: string): ConjugationTableDto {
    return this.grammar.tableOf(lemma);
  }
}
