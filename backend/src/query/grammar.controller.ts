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
  @ApiOperation({ summary: 'Verb lemmas with conjugations in the corpus' })
  @ApiOkResponse({ type: [LemmaDto] })
  lemmas(): LemmaDto[] {
    return this.grammar.lemmas();
  }

  @Get('lemmas/:lemma')
  @ApiOperation({ summary: 'Conjugation table of a lemma (Damana form, gloss, notes)' })
  @ApiParam({ name: 'lemma', example: 'tener' })
  @ApiOkResponse({ type: ConjugationTableDto })
  @ApiNotFoundResponse({ description: 'Lemma without conjugations in the corpus' })
  table(@Param('lemma') lemma: string): ConjugationTableDto {
    return this.grammar.tableOf(lemma);
  }
}
