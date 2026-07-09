import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configurarApp } from '../src/configurar-app';
import { ConsultaModule } from '../src/consulta/consulta.module';
import { DatabaseModule } from '../src/database/database.module';
import { CLIENTE_ANTHROPIC } from '../src/traduccion/anthropic.provider';
import { CONFIG_TRADUCTOR } from '../src/traduccion/config-traductor.provider';
import { TraduccionModule } from '../src/traduccion/traduccion.module';

// E2E sin ningún motor configurado: el traductor debe degradar con gracia
// (503 + instrucciones), nunca romper la app.
describe('Traductor (e2e, sin motor configurado)', () => {
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

  afterAll(async () =>
    app.close());

  it('GET /api/traducir/estado reporta disponible: false sin motor', async () => {
    const res = await request(app.getHttpServer()).get('/api/traducir/estado').expect(200);
    expect(res.body).toEqual({ disponible: false, proveedor: null, modelo: null });
  });

  it('POST /api/traducir responde 503 con instrucciones de configuración', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/traducir')
      .send({ texto: 'nʉnka', direccion: 'damana_a_espanol' })
      .expect(503);
    expect(res.body.message).toContain('ANTHROPIC_API_KEY');
    expect(res.body.message).toContain('TRADUCTOR_BASE_URL');
    expect(res.body.codigo).toBe('SIN_PROVEEDOR');
  });

  it('valida el cuerpo: dirección inválida y texto vacío → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/traducir')
      .send({ texto: 'nʉnka', direccion: 'al_reves' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/traducir')
      .send({ texto: '', direccion: 'damana_a_espanol' })
      .expect(400);
  });
});
