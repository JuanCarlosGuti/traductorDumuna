import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { LemaDto, TablaConjugacionDto } from './dto/consulta.dto';
import { GramaticaService } from './gramatica.service';

@ApiTags('gramatica')
@Controller('gramatica')
export class GramaticaController {
  constructor(private readonly gramatica: GramaticaService) {}

  @Get('lemas')
  @ApiOperation({ summary: 'Lemas verbales con conjugaciones en el corpus' })
  @ApiOkResponse({ type: [LemaDto] })
  lemas(): LemaDto[] {
    return this.gramatica.lemas();
  }

  @Get('lemas/:lema')
  @ApiOperation({ summary: 'Tabla de conjugación de un lema (forma damana, glosa, notas)' })
  @ApiParam({ name: 'lema', example: 'tener' })
  @ApiOkResponse({ type: TablaConjugacionDto })
  @ApiNotFoundResponse({ description: 'Lema sin conjugaciones en el corpus' })
  tabla(@Param('lema') lema: string): TablaConjugacionDto {
    return this.gramatica.tablaDe(lema);
  }
}
