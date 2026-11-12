import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  SrsStatusDto,
  UpdatedProgressDto,
  SrsAnswerDto,
} from './dto/srs.dto';
import { SrsService } from './srs.service';

@ApiTags('srs')
@Controller('srs')
export class SrsController {
  constructor(private readonly srs: SrsService) {}

  @Get('siguiente')
  @ApiOperation({
    summary: 'Próxima tarjeta de repaso',
    description:
      'Mazo = vocabulario completo + las 300 palabras damana más frecuentes. Devuelve primero las tarjetas vencidas, luego las nuevas; tarjeta null si no queda nada.',
  })
  @ApiOkResponse({ type: SrsStatusDto })
  nextCard(): SrsStatusDto {
    return this.srs.nextCard();
  }

  @Post('respuesta')
  @ApiOperation({
    summary: 'Registrar la respuesta de una tarjeta',
    description:
      'Actualiza el progreso con SM-2 simplificado: otra_vez reinicia (vence ya), dificil/bien/facil programan la próxima revisión.',
  })
  @ApiOkResponse({ type: UpdatedProgressDto })
  @ApiNotFoundResponse({ description: 'La palabra no está en el mazo' })
  answer(@Body() dto: SrsAnswerDto): UpdatedProgressDto {
    return this.srs.answer(dto.palabra, dto.calificacion);
  }
}
