import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as ExcelJS from 'exceljs';
import request from 'supertest';
import { configurarApp } from '../src/configurar-app';
import { DatabaseModule } from '../src/database/database.module';
import { PendientesModule } from '../src/pendientes/pendientes.module';
import { PendientesRepository } from '../src/pendientes/pendientes.repository';

describe('Pendientes (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule.forRoot({ rutaDb: ':memory:' }), PendientesModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configurarApp(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('GET /api/pendientes empieza vacío', async () => {
    const res = await request(app.getHttpServer()).get('/api/pendientes').expect(200);
    expect(res.body).toEqual([]);
  });

  it('lista las pendientes registradas, las más pedidas primero', async () => {
    const repo = app.get(PendientesRepository);
    repo.registrarPedida('vecina', 'espanol', 'mi vecina cocina');
    repo.registrarPedida('vecina', 'espanol', null);
    repo.registrarPedida('ñame', 'espanol', 'quiero ñame');

    const res = await request(app.getHttpServer()).get('/api/pendientes').expect(200);
    expect(res.body.map((p: any) => [p.palabra, p.vecesPedida, p.estado])).toEqual([
      ['vecina', 2, 'pendiente'],
      ['ñame', 1, 'pendiente'],
    ]);
  });

  it('POST /api/pendientes/exportar descarga el Excel del formato de elicitación y marca exportadas', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/pendientes/exportar')
      .buffer(true)
      .parse((respuesta, callback) => {
        const trozos: Buffer[] = [];
        respuesta.on('data', (t: Buffer) => trozos.push(t));
        respuesta.on('end', () => callback(null, Buffer.concat(trozos)));
      })
      .expect(201);

    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toMatch(/formato_elicitacion_pendientes_\d{4}-\d{2}-\d{2}\.xlsx/);
    expect(res.headers['x-filas-exportadas']).toBe('2');

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(res.body as ExcelJS.Buffer);
    const hoja = libro.getWorksheet('elicitacion')!;
    expect(hoja.getRow(2).getCell(3).value).toBe('vecina');
    expect(hoja.getRow(3).getCell(3).value).toBe('ñame');

    const despues = await request(app.getHttpServer()).get('/api/pendientes').expect(200);
    expect(despues.body.every((p: any) => p.estado === 'exportada')).toBe(true);
  });
});
