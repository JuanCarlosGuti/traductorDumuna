import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configurarApp } from '../src/configurar-app';
import { ConsultaModule } from '../src/consulta/consulta.module';
import { DatabaseModule } from '../src/database/database.module';
import { CLIENTE_ANTHROPIC } from '../src/traduccion/anthropic.provider';
import { CONFIG_TRADUCTOR } from '../src/traduccion/config-traductor.provider';
import { TraduccionModule } from '../src/traduccion/traduccion.module';

// E2E with no engine configured: the translator must degrade gracefully
// (503 + instructions), never break the app. Validating does work without an engine.
describe('Translator (e2e, no engine configured)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        DatabaseModule.forRoot({ rutaDb: ':memory:' }),
        ConsultaModule,
        TraduccionModule,
      ],
    })
      .overrideProvider(CLIENTE_ANTHROPIC)
      .useValue(null)
      .overrideProvider(CONFIG_TRADUCTOR)
      .useValue({ proveedor: null, modelo: '' })
      .compile();
    app = moduleRef.createNestApplication();
    configurarApp(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('GET /api/traducir/estado reports disponible: false without an engine', async () => {
    const res = await request(app.getHttpServer()).get('/api/traducir/estado').expect(200);
    expect(res.body).toEqual({ disponible: false, proveedor: null, modelo: null });
  });

  it('POST /api/traducir answers 503 with configuration instructions', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/traducir')
      .send({ texto: 'nʉnka', direccion: 'damana_a_espanol' })
      .expect(503);
    expect(res.body.message).toContain('ANTHROPIC_API_KEY');
    expect(res.body.message).toContain('TRADUCTOR_BASE_URL');
    expect(res.body.codigo).toBe('SIN_PROVEEDOR');
  });

  it('validates the body: invalid direction and empty text → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/traducir')
      .send({ texto: 'nʉnka', direccion: 'al_reves' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/traducir')
      .send({ texto: '', direccion: 'damana_a_espanol' })
      .expect(400);
  });

  it('POST /api/traducir/validar stores the confirmed or corrected pair (with ʉ and ñ intact)', async () => {
    const r1 = await request(app.getHttpServer())
      .post('/api/traducir/validar')
      .send({
        texto: 'mi mamá cocina',
        direccion: 'espanol_a_damana',
        traduccion: 'Ranzhe abu dugwa ñingui',
        origen: 'confirmada',
        traduccionModelo: 'Ranzhe abu dugwa ñingui',
      })
      .expect(201);
    expect(r1.body).toEqual({ guardada: true, total: 1 });

    const r2 = await request(app.getHttpServer())
      .post('/api/traducir/validar')
      .send({ texto: 'kʉnʉnka nʉnka', direccion: 'damana_a_espanol', traduccion: 'tiene agua', origen: 'corregida' })
      .expect(201);
    expect(r2.body).toEqual({ guardada: true, total: 2 });
  });

  it('validar rejects an unknown origin', async () => {
    await request(app.getHttpServer())
      .post('/api/traducir/validar')
      .send({ texto: 'x', direccion: 'espanol_a_damana', traduccion: 'y', origen: 'dudosa' })
      .expect(400);
  });
});
