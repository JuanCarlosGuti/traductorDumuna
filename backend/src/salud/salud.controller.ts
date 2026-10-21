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
 * Endpoint de salud para kamal-proxy (y para UptimeRobot). Público a
 * propósito: el proxy no tiene sesión. Un 200 aquí es lo que hace que el
 * contenedor nuevo empiece a recibir visitas, así que responde 503 cuando
 * la base no trae corpus: esa imagen salió mal y NO debe reemplazar a la
 * anterior aunque el proceso esté vivo.
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
