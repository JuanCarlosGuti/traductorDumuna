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

const BOM = String.fromCharCode(0xfeff);

describe('API REST (e2e, SQLite en memoria con mini-corpus)', () => {
  let dirTmp: string;
  let app: INestApplication;

  beforeAll(async () => {
    // Mini-corpus: nʉnka aparece en las 3 fuentes; Jehovága y Ñingui solo
    // con mayúscula inicial (probables nombres propios); 'agua' es la
    // palabra española que co-ocurre con nʉnka en todos los paralelos.
    dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-api-'));
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_capitulos.csv'),
      BOM +
        'capitulo,titulo_damana,titulo_espanol,damana,espanol\n' +
        '1,Ñingui shkua,El agua del principio,"Jehovága nʉnka kʉñingui gontka\nshke\'ta ukurra ¿nanu? 42 nʉnka shkua",Jehová hizo el agua del cielo\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_frases.csv'),
      BOM +
        'fuente,damana,espanol,notas\n' +
        'Prueba,¿Zhinzhoma nʉnka nanu?,¿Conoces el agua?,\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_vocabulario.csv'),
      BOM + 'espanol,damana,notas\n' + 'agua,nʉnka,\n' + 'feliz,zen zhiguana,\n',
      'utf8',
    );

    const moduleRef = await Test.createTestingModule({
      imports: [
        DatabaseModule.forRoot({ rutaDb: ':memory:' }),
        ImportadorModule,
        ConsultaModule,
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

  describe('GET /api/buscar', () => {
    it('concordancia damana con ʉ: <mark>, referencia y texto paralelo', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/buscar')
        .query({ q: 'nʉnka' })
        .expect(200);
      expect(res.body.total).toBe(4); // 2 en capítulo 1, 1 en frase, 1 en vocabulario
      const capitulo = res.body.resultados[0];
      expect(capitulo.fuente).toBe('capitulos');
      expect(capitulo.referencia).toBe('capítulo 1');
      expect(capitulo.fragmento).toContain('<mark>nʉnka</mark>');
      expect(capitulo.textoParalelo).toContain('Jehová hizo el agua');
      const fuentes = res.body.resultados.map((r: any) => r.fuente);
      expect(fuentes).toContain('frases');
      expect(fuentes).toContain('vocabulario');
    });

    it('nunca degrada ʉ a u: buscar nunka no encuentra nada', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/buscar')
        .query({ q: 'nunka' })
        .expect(200);
      expect(res.body.total).toBe(0);
    });

    it('busca en español (insensible a tildes) con el damana como paralelo', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/buscar')
        .query({ q: 'jehova', idioma: 'espanol' })
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.resultados[0].fragmento).toContain('<mark>Jehová</mark>');
      expect(res.body.resultados[0].textoParalelo).toContain('Jehovága');
    });

    it('filtra por fuente', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/buscar')
        .query({ q: 'nʉnka', fuente: 'frases' })
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.resultados[0].referencia).toBe('frase 1 (Prueba)');
    });

    it('valida idioma y q: 400 para valores inválidos', async () => {
      await request(app.getHttpServer())
        .get('/api/buscar')
        .query({ q: 'nʉnka', idioma: 'klingon' })
        .expect(400);
      await request(app.getHttpServer()).get('/api/buscar').expect(400);
    });
  });

  describe('GET /api/palabra/:token', () => {
    it('ficha completa de una palabra con ʉ', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/palabra/${encodeURIComponent('nʉnka')}`)
        .expect(200);
      expect(res.body.palabra).toBe('nʉnka');
      expect(res.body.frecuenciaTotal).toBe(4);
      expect(res.body.frecuenciaPorFuente).toEqual([
        { fuente: 'capitulos', frecuencia: 2 },
        { fuente: 'frases', frecuencia: 1 },
        { fuente: 'vocabulario', frecuencia: 1 },
      ]);
      expect(res.body.concordancias.length).toBeLessThanOrEqual(10);
      expect(res.body.concordancias[0].fragmento).toContain('<mark>nʉnka</mark>');
      // 'agua' co-ocurre en los 3 paralelos; stopwords fuera
      expect(res.body.traduccionesCandidatas[0].palabra).toBe('agua');
      const candidatas = res.body.traduccionesCandidatas.map((c: any) => c.palabra);
      expect(candidatas).not.toContain('el');
      expect(candidatas).not.toContain('del');
    });

    it('404 para palabras fuera del corpus', async () => {
      await request(app.getHttpServer()).get('/api/palabra/inexistente').expect(404);
    });
  });

  describe('GET /api/frecuencias', () => {
    it('excluye probables nombres propios y conserva palabras con ʉ', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/frecuencias')
        .expect(200);
      const palabras = res.body.map((f: any) => f.palabra);
      expect(palabras).toContain('nʉnka');
      expect(palabras).toContain('shkua'); // aparece en minúscula
      expect(palabras).not.toContain('jehovaga'); // solo 'Jehovága'
      expect(palabras).not.toContain('ñingui'); // solo 'Ñingui'
      expect(res.body[0].palabra).toBe('nʉnka'); // la más frecuente
    });

    it('respeta limite y valida que sea entero positivo', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/frecuencias')
        .query({ limite: 1 })
        .expect(200);
      expect(res.body).toHaveLength(1);
      await request(app.getHttpServer())
        .get('/api/frecuencias')
        .query({ limite: 'muchas' })
        .expect(400);
    });
  });

  describe('listados completos', () => {
    it('GET /api/vocabulario devuelve todas las entradas con id', async () => {
      const res = await request(app.getHttpServer()).get('/api/vocabulario').expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toMatchObject({ id: 1, espanol: 'agua', damana: 'nʉnka' });
    });

    it('GET /api/frases devuelve todas las frases con id', async () => {
      const res = await request(app.getHttpServer()).get('/api/frases').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: 1,
        fuente: 'Prueba',
        damana: '¿Zhinzhoma nʉnka nanu?',
      });
    });
  });
});
