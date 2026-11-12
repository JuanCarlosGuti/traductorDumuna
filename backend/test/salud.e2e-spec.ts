import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Database } from 'better-sqlite3';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
import { ConfigAuth } from '../src/auth/auth.config';
import { configurarApp } from '../src/configurar-app';
import { CONEXION_DB } from '../src/database/database.constants';
import { DatabaseModule } from '../src/database/database.module';
import { SaludModule } from '../src/salud/salud.module';

const config: ConfigAuth = {
  activa: true,
  usuario: 'juan',
  password: 'ñandú-ʉnkua-2026',
  secreto: 'secreto-e2e-suficientemente-largo-para-firmar',
  duracionDias: 30,
};

// The kamal-proxy healthcheck has no session: it must answer without a token
// even if authentication is active, and must say 503 if there is no corpus.
describe('Health (e2e, with authentication active)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule.forRoot(config), DatabaseModule.forRoot({ rutaDb: ':memory:' }), SaludModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configurarApp(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('without a corpus it answers 503 (that deployment must not receive traffic)', async () => {
    const res = await request(app.getHttpServer()).get('/api/salud').expect(503);
    expect(res.body.estado).toBe('sin_corpus');
  });

  it('with a corpus it answers 200 without a token', async () => {
    const db = app.get<Database>(CONEXION_DB);
    db.prepare(
      "INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente) VALUES ('agua', 'nʉnka', 'Otros', NULL, 'dic')",
    ).run();
    const res = await request(app.getHttpServer()).get('/api/salud').expect(200);
    expect(res.body).toEqual({ estado: 'ok' });
  });
});
