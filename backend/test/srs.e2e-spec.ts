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
      path.join(dirTmp, 'corpus_vocabulario_v2.csv'),
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
