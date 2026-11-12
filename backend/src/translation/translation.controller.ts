import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  TranslatorStatusDto,
  TranslationResponseDto,
  TranslateDto,
  SavedValidationDto,
  ValidateTranslationDto,
} from './dto/translation.dto';
import { TranslationService } from './translation.service';

@ApiTags('translation')
@Controller('translate')
export class TranslationController {
  constructor(private readonly translation: TranslationService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Disponibilidad y motor del traductor',
    description:
      'Motores: ANTHROPIC_API_KEY → Claude (prioridad); TRADUCTOR_BASE_URL + TRADUCTOR_MODELO → API compatible OpenAI (Ollama, Gemini, Groq, Hugging Face). Sin nada configurado: disponible=false.',
  })
  @ApiOkResponse({ type: TranslatorStatusDto })
  status(): TranslatorStatusDto {
    const config = this.translation.configuration();
    return {
      available: this.translation.available(),
      provider: config.provider,
      model: config.provider ? config.model : null,
    };
  }

  @Post()
  @ApiOperation({
    summary: 'Traducción asistida damana ↔ español',
    description:
      'El prompt lleva, en este orden: reglas gramaticales aplicables, diccionario palabra por palabra (exacta → sin tildes → singular → prefijo), nombres propios, y ejemplos por similitud con cupos por dominio (hasta 6 cotidianos, 4 de gramática, 4 bíblicos —2 si hay cotidianos suficientes—, máximo 14). Devuelve glosa, palabras sin equivalente (se registran en pendientes), reglas aplicadas y confianza, más todo el apoyo usado.',
  })
  @ApiOkResponse({ type: TranslationResponseDto })
  @ApiServiceUnavailableResponse({ description: 'Ningún motor configurado (codigo: SIN_PROVEEDOR)' })
  @ApiBadGatewayResponse({ description: 'Error del proveedor o respuesta no parseable' })
  translate(@Body() dto: TranslateDto): Promise<TranslationResponseDto> {
    return this.translation.translate(dto);
  }

  @Post('validate')
  @ApiOperation({
    summary: 'Guardar una traducción confirmada o corregida',
    description:
      'Botones «esta traducción es correcta» y «corregir» de la vista: el par queda en la tabla validadas, futura fuente cotidiana de máxima confianza.',
  })
  @ApiOkResponse({ type: SavedValidationDto })
  validate(@Body() dto: ValidateTranslationDto): SavedValidationDto {
    return this.translation.validate(dto);
  }
}
