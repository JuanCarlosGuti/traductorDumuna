import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/configure-app';
import { QueryModule } from '../src/query/query.module';
import { DatabaseModule } from '../src/database/database.module';
import { ANTHROPIC_CLIENT } from '../src/translation/anthropic.provider';
import { TRANSLATOR_CONFIG } from '../src/translation/translator-config.provider';
import { TranslationModule } from '../src/translation/translation.module';

// E2E with no engine configured: the translator must degrade gracefully
// (503 + instructions), never break the app. Validating does work without an engine.
describe('Translator (e2e, no engine configured)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        DatabaseModule.forRoot({ dbPath: ':memory:' }),
        QueryModule,
        TranslationModule,
      ],
    })
      .overrideProvider(ANTHROPIC_CLIENT)
      .useValue(null)
      .overrideProvider(TRANSLATOR_CONFIG)
      .useValue({ provider: null, model: '' })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('GET /api/translate/status reports disponible: false without an engine', async () => {
    const res = await request(app.getHttpServer()).get('/api/translate/status').expect(200);
    expect(res.body).toEqual({ available: false, provider: null, model: null });
  });

  it('POST /api/translate answers 503 with configuration instructions', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/translate')
      .send({ text: 'nʉnka', direction: 'damana_to_spanish' })
      .expect(503);
    expect(res.body.message).toContain('ANTHROPIC_API_KEY');
    expect(res.body.message).toContain('TRANSLATOR_BASE_URL');
    expect(res.body.code).toBe('NO_PROVIDER');
  });

  it('validates the body: invalid direction and empty text → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/translate')
      .send({ text: 'nʉnka', direction: 'al_reves' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/translate')
      .send({ text: '', direction: 'damana_to_spanish' })
      .expect(400);
  });

  it('POST /api/translate/validate stores the confirmed or corrected pair (with ʉ and ñ intact)', async () => {
    const r1 = await request(app.getHttpServer())
      .post('/api/translate/validate')
      .send({
        text: 'mi mamá cocina',
        direction: 'spanish_to_damana',
        translation: 'Ranzhe abu dugwa ñingui',
        origin: 'confirmed',
        modelTranslation: 'Ranzhe abu dugwa ñingui',
      })
      .expect(201);
    expect(r1.body).toEqual({ saved: true, total: 1 });

    const r2 = await request(app.getHttpServer())
      .post('/api/translate/validate')
      .send({ text: 'kʉnʉnka nʉnka', direction: 'damana_to_spanish', translation: 'tiene agua', origin: 'corrected' })
      .expect(201);
    expect(r2.body).toEqual({ saved: true, total: 2 });
  });

  it('validar rejects an unknown origin', async () => {
    await request(app.getHttpServer())
      .post('/api/translate/validate')
      .send({ text: 'x', direction: 'spanish_to_damana', translation: 'y', origin: 'dudosa' })
      .expect(400);
  });
});
