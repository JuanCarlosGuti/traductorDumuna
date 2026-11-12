import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { configureApp } from '../src/configure-app';
import { QueryModule } from '../src/query/query.module';
import { DatabaseModule } from '../src/database/database.module';
import { ImporterModule } from '../src/importer/importer.module';
import { ImporterService } from '../src/importer/importer.service';
import { SrsModule } from '../src/srs/srs.module';

const BOM = String.fromCharCode(0xfeff);

describe('SRS (e2e, corpus v3)', () => {
  let dirTmp: string;
  let app: INestApplication;

  beforeAll(async () => {
    dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-srs-'));
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_oraciones.csv'),
      BOM +
        'id,damana,espanol,estado,fuente\n' +
        'o1,nʉnka gontka nʉnka ñingui,Dios hizo el agua otra vez,aprobado,lfb\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_frases_v2.csv'),
      BOM + 'fuente,damana,espanol,notas\n' + 'Prueba,gontka nanu,hizo esto,\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_vocabulario_v3.csv'),
      BOM + 'espanol,damana,categoria,notas,fuente\n' + 'agua,nʉnka,Otros,,dic\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_conjugaciones.csv'),
      BOM + 'damana,espanol,lema,fuente,notas\n' + 'gontkanka,él hizo,hacer,doc,\n',
      'utf8',
    );

    const moduleRef = await Test.createTestingModule({
      imports: [
        DatabaseModule.forRoot({ dbPath: ':memory:' }),
        ImporterModule,
        QueryModule,
        SrsModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await app.get(ImporterService).importAll(dirTmp);
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(dirTmp, { recursive: true, force: true });
  });

  it('GET /api/srs/next serves the vocabulary first (with ʉ)', async () => {
    const res = await request(app.getHttpServer()).get('/api/srs/next').expect(200);
    expect(res.body.card).toMatchObject({
      word: 'nʉnka',
      type: 'vocabulario',
      translation: 'agua',
    });
    expect(res.body.newCards).toBeGreaterThan(0);
  });

  it('POST /api/srs/answer updates the progress and advances the deck', async () => {
    const r1 = await request(app.getHttpServer())
      .post('/api/srs/answer')
      .send({ word: 'nʉnka', grade: 'bien' })
      .expect(201);
    expect(r1.body).toMatchObject({ word: 'nʉnka', repetitions: 1, intervalDays: 1 });

    const res = await request(app.getHttpServer()).get('/api/srs/next').expect(200);
    expect(res.body.card.word).not.toBe('nʉnka'); // scheduled for tomorrow
    expect(res.body.card.type).toBe('frecuencia');
    expect(res.body.card.translation).toContain('candidatas');
  });

  it('validates the grade and the word', async () => {
    await request(app.getHttpServer())
      .post('/api/srs/answer')
      .send({ word: 'nʉnka', grade: 'regular' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/srs/answer')
      .send({ word: 'inexistente', grade: 'bien' })
      .expect(404);
  });
});
