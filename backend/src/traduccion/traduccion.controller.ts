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
      'Traducción con claude-sonnet-4-6 apoyada en el corpus: los 8 fragmentos más similares (TF-IDF) y las entradas de vocabulario presentes en el texto van como contexto en el prompt. Devuelve también esos apoyos para poder estudiarlos.',
  })
  @ApiOkResponse({ type: RespuestaTraduccionDto })
  @ApiServiceUnavailableResponse({ description: 'Falta ANTHROPIC_API_KEY (codigo: SIN_API_KEY)' })
  @ApiBadGatewayResponse({ description: 'Error de la API de Anthropic o respuesta no parseable' })
  traducir(@Body() dto: TraducirDto): Promise<RespuestaTraduccionDto> {
    return this.traduccion.traducir(dto);
  }
}
