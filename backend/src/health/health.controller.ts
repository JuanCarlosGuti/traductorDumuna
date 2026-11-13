import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Database } from 'better-sqlite3';
import { Public } from '../auth/public.decorator';
import { DB_CONNECTION } from '../database/database.constants';

export class HealthStatusDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';
}

/**
 * Health endpoint for kamal-proxy (and for UptimeRobot). Public on
 * purpose: the proxy has no session. A 200 here is what makes the
 * new container start receiving traffic, so it answers 503 when
 * the database has no corpus: that image came out wrong and must NOT replace the
 * previous one even if the process is alive.
 */
@ApiTags('health')
// 'salud' is kept as an alias so existing external monitors keep working.
@Controller(['health', 'salud'])
export class HealthController {
  constructor(@Inject(DB_CONNECTION) private readonly db: Database) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Service health (no session required)',
    description: '200 if the database has a corpus; 503 if it is empty or not responding.',
  })
  @ApiOkResponse({ type: HealthStatusDto })
  @ApiServiceUnavailableResponse({ description: 'The database has no corpus (status: no_corpus)' })
  status(): HealthStatusDto {
    let words = 0;
    try {
      words = (this.db.prepare('SELECT COUNT(*) AS n FROM vocabulary').get() as { n: number }).n;
    } catch {
      words = 0;
    }
    if (words === 0) {
      throw new ServiceUnavailableException({
        status: 'no_corpus',
        message: 'The database has no corpus: run npm run import:corpus.',
      });
    }
    return { status: 'ok' };
  }
}
