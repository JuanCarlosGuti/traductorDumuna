import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Database } from 'better-sqlite3';
import { Publico } from '../auth/publico.decorator';
import { CONEXION_DB } from '../database/database.constants';

export class EstadoSaludDto {
  @ApiProperty({ example: 'ok' })
  estado!: 'ok';
}

/**
 * Health endpoint for kamal-proxy (and for UptimeRobot). Public on
 * purpose: the proxy has no session. A 200 here is what makes the
 * new container start receiving traffic, so it answers 503 when
 * the database has no corpus: that image came out wrong and must NOT replace the
 * previous one even if the process is alive.
 */
@ApiTags('salud')
@Controller('salud')
export class SaludController {
  constructor(@Inject(CONEXION_DB) private readonly db: Database) {}

  @Publico()
  @Get()
  @ApiOperation({
    summary: 'Salud del servicio (sin sesión)',
    description: '200 si la base tiene corpus; 503 si está vacía o no responde.',
  })
  @ApiOkResponse({ type: EstadoSaludDto })
  @ApiServiceUnavailableResponse({ description: 'La base no tiene corpus (estado: sin_corpus)' })
  estado(): EstadoSaludDto {
    let palabras = 0;
    try {
      palabras = (this.db.prepare('SELECT COUNT(*) AS n FROM vocabulario').get() as { n: number }).n;
    } catch {
      palabras = 0;
    }
    if (palabras === 0) {
      throw new ServiceUnavailableException({
        estado: 'sin_corpus',
        message: 'La base no tiene corpus: falta npm run importar.',
      });
    }
    return { estado: 'ok' };
  }
}
