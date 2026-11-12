import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as ExcelJS from 'exceljs';
import request from 'supertest';
import { configureApp } from '../src/configure-app';
import { DatabaseModule } from '../src/database/database.module';
import { PendingModule } from '../src/pending/pending.module';
import { PendingRepository } from '../src/pending/pending.repository';

describe('Pending items (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule.forRoot({ rutaDb: ':memory:' }), PendingModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('GET /api/pendientes starts empty', async () => {
    const res = await request(app.getHttpServer()).get('/api/pendientes').expect(200);
    expect(res.body).toEqual([]);
  });

  it('lists the recorded pending items, most requested first', async () => {
    const repo = app.get(PendingRepository);
    repo.recordRequested('vecina', 'espanol', 'mi vecina cocina');
    repo.recordRequested('vecina', 'espanol', null);
    repo.recordRequested('ñame', 'espanol', 'quiero ñame');

    const res = await request(app.getHttpServer()).get('/api/pendientes').expect(200);
    expect(res.body.map((p: any) => [p.palabra, p.vecesPedida, p.estado])).toEqual([
      ['vecina', 2, 'pendiente'],
      ['ñame', 1, 'pendiente'],
    ]);
  });

  it('POST /api/pendientes/exportar downloads the elicitation-format Excel and marks them exported', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/pendientes/exportar')
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (t: Buffer) => chunks.push(t));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(201);

    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toMatch(/formato_elicitacion_pendientes_\d{4}-\d{2}-\d{2}\.xlsx/);
    expect(res.headers['x-filas-exportadas']).toBe('2');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet('elicitacion')!;
    expect(sheet.getRow(2).getCell(3).value).toBe('vecina');
    expect(sheet.getRow(3).getCell(3).value).toBe('ñame');

    const after = await request(app.getHttpServer()).get('/api/pendientes').expect(200);
    expect(after.body.every((p: any) => p.estado === 'exportada')).toBe(true);
  });
});
