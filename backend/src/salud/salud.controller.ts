import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Database } from 'better-sqlite3';
import { Public } from '../auth/publico.decorator';
import { DB_CONNECTION } from '../database/database.constants';

export class HealthStatusDto {
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
export class HealthController {
  constructor(@Inject(DB_CONNECTION) private readonly db: Database) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Salud del servicio (sin sesión)',
    description: '200 si la base tiene corpus; 503 si está vacía o no responde.',
  })
  @ApiOkResponse({ type: HealthStatusDto })
  @ApiServiceUnavailableResponse({ description: 'La base no tiene corpus (estado: sin_corpus)' })
  status(): HealthStatusDto {
    let words = 0;
    try {
      words = (this.db.prepare('SELECT COUNT(*) AS n FROM vocabulario').get() as { n: number }).n;
    } catch {
      words = 0;
    }
    if (words === 0) {
      throw new ServiceUnavailableException({
        estado: 'sin_corpus',
        message: 'La base no tiene corpus: falta npm run importar.',
      });
    }
    return { estado: 'ok' };
  }
}
