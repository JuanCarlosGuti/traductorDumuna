import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Database } from 'better-sqlite3';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
import { ConfigAuth } from '../src/auth/auth.config';
import { configureApp } from '../src/configure-app';
import { DB_CONNECTION } from '../src/database/database.constants';
import { DatabaseModule } from '../src/database/database.module';
import { HealthModule } from '../src/health/health.module';

const config: ConfigAuth = {
  active: true,
  user: 'juan',
  password: 'ñandú-ʉnkua-2026',
  secret: 'secreto-e2e-suficientemente-largo-para-firmar',
  durationDays: 30,
};

// The kamal-proxy healthcheck has no session: it must answer without a token
// even if authentication is active, and must say 503 if there is no corpus.
describe('Health (e2e, with authentication active)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule.forRoot(config), DatabaseModule.forRoot({ dbPath: ':memory:' }), HealthModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('without a corpus it answers 503 (that deployment must not receive traffic)', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(503);
    expect(res.body.status).toBe('sin_corpus');
  });

  it('with a corpus it answers 200 without a token', async () => {
    const db = app.get<Database>(DB_CONNECTION);
    db.prepare(
      "INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente) VALUES ('agua', 'nʉnka', 'Otros', NULL, 'dic')",
    ).run();
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
