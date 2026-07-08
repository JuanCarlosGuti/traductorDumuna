import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { configurarApp } from '../src/configurar-app';
import { ConsultaModule } from '../src/consulta/consulta.module';
import { DatabaseModule } from '../src/database/database.module';
import { ImportadorModule } from '../src/importador/importador.module';
import { ImportadorService } from '../src/importador/importador.service';
import { SrsModule } from '../src/srs/srs.module';

const BOM = String.fromCharCode(0xfeff);

describe('SRS (e2e)', () => {
  let dirTmp: string;
  let app: INestApplication;

  beforeAll(async () => {
    dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-srs-'));
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_capitulos.csv'),
      BOM +
        'capitulo,titulo_damana,titulo_espanol,damana,espanol\n' +
        '1,Shkua,Uno,"nʉnka gontka nʉnka ñingui",Dios hizo el agua otra vez\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_frases.csv'),
      BOM + 'fuente,damana,espanol,notas\n' + 'Prueba,gontka nanu,hizo esto,\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_vocabulario.csv'),
      BOM + 'espanol,damana,notas\n' + 'agua,nʉnka,\n',
      'utf8',
    );

    const moduleRef = await Test.createTestingModule({
      imports: [
        DatabaseModule.forRoot({ rutaDb: ':memory:' }),
        ImportadorModule,
        ConsultaModule,
        SrsModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    configurarApp(app);
    await app.init();
    app.get(ImportadorService).importarTodo(dirTmp);
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(dirTmp, { recursive: true, force: true });
  });

  it('GET /api/srs/siguiente entrega el vocabulario primero (con ʉ)', async () => {
    const res = await request(app.getHttpServer()).get('/api/srs/siguiente').expect(200);
    expect(res.body.tarjeta).toMatchObject({
      palabra: 'nʉnka',
      tipo: 'vocabulario',
      traduccion: 'agua',
    });
    expect(res.body.nuevas).toBeGreaterThan(0);
  });

  it('POST /api/srs/respuesta actualiza el progreso y avanza el mazo', async () => {
    const r1 = await request(app.getHttpServer())
      .post('/api/srs/respuesta')
      .send({ palabra: 'nʉnka', calificacion: 'bien' })
      .expect(201);
    expect(r1.body).toMatchObject({ palabra: 'nʉnka', repeticiones: 1, intervaloDias: 1 });

    const res = await request(app.getHttpServer()).get('/api/srs/siguiente').expect(200);
    expect(res.body.tarjeta.palabra).not.toBe('nʉnka'); // programada para mañana
    expect(res.body.tarjeta.tipo).toBe('frecuencia');
    expect(res.body.tarjeta.traduccion).toContain('candidatas');
  });

  it('valida la calificación y la palabra', async () => {
    await request(app.getHttpServer())
      .post('/api/srs/respuesta')
      .send({ palabra: 'nʉnka', calificacion: 'regular' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/srs/respuesta')
      .send({ palabra: 'inexistente', calificacion: 'bien' })
      .expect(404);
  });
});
