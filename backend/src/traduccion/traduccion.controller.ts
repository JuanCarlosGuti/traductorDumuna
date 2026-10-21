import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  EstadoTraductorDto,
  RespuestaTraduccionDto,
  TraducirDto,
  ValidacionGuardadaDto,
  ValidarTraduccionDto,
} from './dto/traduccion.dto';
import { TraduccionService } from './traduccion.service';

@ApiTags('traduccion')
@Controller('traducir')
export class TraduccionController {
  constructor(private readonly traduccion: TraduccionService) {}

  @Get('estado')
  @ApiOperation({
    summary: 'Disponibilidad y motor del traductor',
    description:
      'Motores: ANTHROPIC_API_KEY → Claude (prioridad); TRADUCTOR_BASE_URL + TRADUCTOR_MODELO → API compatible OpenAI (Ollama, Gemini, Groq, Hugging Face). Sin nada configurado: disponible=false.',
  })
  @ApiOkResponse({ type: EstadoTraductorDto })
  estado(): EstadoTraductorDto {
    const config = this.traduccion.configuracion();
    return {
      disponible: this.traduccion.disponible(),
      proveedor: config.proveedor,
      modelo: config.proveedor ? config.modelo : null,
    };
  }

  @Post()
  @ApiOperation({
    summary: 'Traducción asistida damana ↔ español',
    description:
      'El prompt lleva, en este orden: reglas gramaticales aplicables, diccionario palabra por palabra (exacta → sin tildes → singular → prefijo), nombres propios, y ejemplos por similitud con cupos por dominio (hasta 6 cotidianos, 4 de gramática, 4 bíblicos —2 si hay cotidianos suficientes—, máximo 14). Devuelve glosa, palabras sin equivalente (se registran en pendientes), reglas aplicadas y confianza, más todo el apoyo usado.',
  })
  @ApiOkResponse({ type: RespuestaTraduccionDto })
  @ApiServiceUnavailableResponse({ description: 'Ningún motor configurado (codigo: SIN_PROVEEDOR)' })
  @ApiBadGatewayResponse({ description: 'Error del proveedor o respuesta no parseable' })
  traducir(@Body() dto: TraducirDto): Promise<RespuestaTraduccionDto> {
    return this.traduccion.traducir(dto);
  }

  @Post('validar')
  @ApiOperation({
    summary: 'Guardar una traducción confirmada o corregida',
    description:
      'Botones «esta traducción es correcta» y «corregir» de la vista: el par queda en la tabla validadas, futura fuente cotidiana de máxima confianza.',
  })
  @ApiOkResponse({ type: ValidacionGuardadaDto })
  validar(@Body() dto: ValidarTraduccionDto): ValidacionGuardadaDto {
    return this.traduccion.validar(dto);
  }
}
