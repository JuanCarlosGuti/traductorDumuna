import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { BusquedaService } from './busqueda.service';
import { CorpusRepository } from './corpus.repository';
import {
  BuscarQueryDto,
  FichaPalabraDto,
  FraseDto,
  FrecuenciaDto,
  FrecuenciasQueryDto,
  RespuestaBusquedaDto,
  VocabularioDto,
} from './dto/consulta.dto';
import { FrecuenciasService } from './frecuencias.service';
import { PalabraService } from './palabra.service';

@ApiTags('consulta')
@Controller()
export class ConsultaController {
  constructor(
    private readonly busqueda: BusquedaService,
    private readonly palabra: PalabraService,
    private readonly frecuencias: FrecuenciasService,
    private readonly repo: CorpusRepository,
  ) {}

  @Get('buscar')
  @ApiOperation({
    summary: 'Concordancia de una palabra',
    description:
      'Cada ocurrencia con su fragmento de contexto (±120 caracteres, cortando en límite de palabra, la palabra en <mark>), el texto paralelo del otro idioma y la referencia. ʉ ≠ u y ñ ≠ n; tildes y mayúsculas se ignoran.',
  })
  @ApiOkResponse({ type: RespuestaBusquedaDto })
  buscar(@Query() query: BuscarQueryDto): RespuestaBusquedaDto {
    return this.busqueda.buscar({
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
  @ApiOkResponse({ type: FichaPalabraDto })
  @ApiNotFoundResponse({ description: 'La palabra no aparece en el corpus' })
  fichaPalabra(@Param('token') token: string): FichaPalabraDto {
    return this.palabra.ficha(token);
  }

  @Get('frecuencias')
  @ApiOperation({
    summary: 'Palabras damana por frecuencia descendente',
    description:
      'Excluye probables nombres propios (heurística: tokens que solo aparecen con mayúscula inicial en los originales).',
  })
  @ApiOkResponse({ type: [FrecuenciaDto] })
  listarFrecuencias(@Query() query: FrecuenciasQueryDto): FrecuenciaDto[] {
    return this.frecuencias.listar(query.limite);
  }

  @Get('vocabulario')
  @ApiOperation({ summary: 'Listado completo del vocabulario' })
  @ApiOkResponse({ type: [VocabularioDto] })
  listarVocabulario(): VocabularioDto[] {
    return this.repo.listarVocabulario();
  }

  @Get('frases')
  @ApiOperation({ summary: 'Listado completo de las frases' })
  @ApiOkResponse({ type: [FraseDto] })
  listarFrases(): FraseDto[] {
    return this.repo.listarFrases();
  }
}
