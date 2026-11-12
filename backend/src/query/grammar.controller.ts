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

@ApiTags('grammar')
@Controller('grammar')
export class GrammarController {
  constructor(private readonly grammar: GrammarService) {}

  @Get('lemmas')
  @ApiOperation({ summary: 'Lemas verbales con conjugaciones en el corpus' })
  @ApiOkResponse({ type: [LemmaDto] })
  lemmas(): LemmaDto[] {
    return this.grammar.lemmas();
  }

  @Get('lemmas/:lemma')
  @ApiOperation({ summary: 'Tabla de conjugación de un lema (forma damana, glosa, notas)' })
  @ApiParam({ name: 'lema', example: 'tener' })
  @ApiOkResponse({ type: ConjugationTableDto })
  @ApiNotFoundResponse({ description: 'Lema sin conjugaciones en el corpus' })
  table(@Param('lemma') lemma: string): ConjugationTableDto {
    return this.grammar.tableOf(lemma);
  }
}
