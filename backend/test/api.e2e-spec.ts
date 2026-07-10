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

describe('API REST (e2e, SQLite en memoria con mini-corpus v3)', () => {
  let dirTmp: string;
  let app: INestApplication;

  beforeAll(async () => {
    // Mini-corpus: nʉnka aparece en oraciones, frases y vocabulario;
    // Jehovága solo con mayúscula (probable nombre propio); 'agua' es la
    // palabra española que co-ocurre con nʉnka en todos los paralelos.
    dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-api-'));
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_oraciones.csv'),
      BOM +
        'id,damana,espanol,estado,fuente\n' +
        'o1,Jehovága nʉnka kʉñingui gontka,Jehová hizo el agua del cielo,aprobado,lfb\n' +
        'o2,nʉnka shkua,el agua es una,revisar,lfb\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_frases_v2.csv'),
      BOM +
        'fuente,damana,espanol,notas\n' +
        'Prueba,¿Zhinzhoma nʉnka nanu?,¿Conoces el agua?,\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_vocabulario_v2.csv'),
      BOM +
        'espanol,damana,categoria,notas,fuente\n' +
        'agua,nʉnka,Otros,,dic\n' +
        'feliz,zen zhiguana,Adjetivos,,dic\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(dirTmp, 'corpus_conjugaciones.csv'),
      BOM +
        'damana,espanol,lema,fuente,notas\n' +
        'nujkunʉnanka,yo tuve,tener,VERBO TENER.docx,\n' +
        'mujkunʉnanka,tú tuviste,tener,VERBO TENER.docx,\n',
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
      expect(res.body.total).toBe(4); // 2 oraciones, 1 frase, 1 vocabulario
      const oracion = res.body.resultados[0];
      expect(oracion.fuente).toBe('oraciones');
      expect(oracion.referencia).toBe('oración 1');
      expect(oracion.fragmento).toContain('<mark>nʉnka</mark>');
      expect(oracion.textoParalelo).toContain('Jehová hizo el agua');
      const fuentes = res.body.resultados.map((r: any) => r.fuente);
      expect(fuentes).toContain('frases');
      expect(fuentes).toContain('vocabulario');
      // la oración con alineación dudosa queda marcada
      const referencias = res.body.resultados.map((r: any) => r.referencia);
      expect(referencias).toContain('oración 2 (revisar)');
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

    it('filtra por fuente, incluidas las conjugaciones', async () => {
      const frases = await request(app.getHttpServer())
        .get('/api/buscar')
        .query({ q: 'nʉnka', fuente: 'frases' })
        .expect(200);
      expect(frases.body.total).toBe(1);
      expect(frases.body.resultados[0].referencia).toBe('frase 1 (Prueba)');

      const conjugaciones = await request(app.getHttpServer())
        .get('/api/buscar')
        .query({ q: 'nujkunʉnanka', fuente: 'conjugaciones' })
        .expect(200);
      expect(conjugaciones.body.total).toBe(1);
      expect(conjugaciones.body.resultados[0].referencia).toBe('conjugación 1 (tener)');
      expect(conjugaciones.body.resultados[0].textoParalelo).toBe('yo tuve');
    });

    it('una frase de varias palabras busca por similitud con puntaje y resaltado', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/buscar')
        .query({ q: 'jehova hizo el agua', idioma: 'espanol' })
        .expect(200);
      expect(res.body.modo).toBe('similitud');
      expect(res.body.total).toBeGreaterThan(0);
      const primero = res.body.resultados[0];
      expect(primero.referencia).toBe('oración 1');
      expect(primero.puntaje).toBeGreaterThan(0);
      expect(primero.fragmento).toContain('<mark>Jehová</mark>');
      expect(primero.fragmento).toContain('<mark>agua</mark>');
      expect(primero.textoParalelo).toContain('Jehovága');
    });

    it('valida idioma y q: 400 para valores inválidos', async () => {
      await request(app.getHttpServer())
        .get('/api/buscar')
        .query({ q: 'nʉnka', idioma: 'klingon' })
        .expect(400);
      await request(app.getHttpServer())
        .get('/api/buscar')
        .query({ q: 'nʉnka', fuente: 'capitulos' })
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
        { fuente: 'frases', frecuencia: 1 },
        { fuente: 'oraciones', frecuencia: 2 },
        { fuente: 'vocabulario', frecuencia: 1 },
      ]);
      expect(res.body.concordancias.length).toBeLessThanOrEqual(10);
      expect(res.body.concordancias[0].fragmento).toContain('<mark>nʉnka</mark>');
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
    it('excluye probables nombres propios y trae la categoría del vocabulario', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/frecuencias')
        .expect(200);
      const palabras = res.body.map((f: any) => f.palabra);
      expect(palabras).toContain('nʉnka');
      expect(palabras).not.toContain('jehovaga'); // solo 'Jehovága'
      expect(res.body[0]).toEqual({ palabra: 'nʉnka', frecuencia: 4, categoria: 'Otros' });
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

  describe('GET /api/gramatica', () => {
    it('lista los lemas con su número de formas', async () => {
      const res = await request(app.getHttpServer()).get('/api/gramatica/lemas').expect(200);
      expect(res.body).toEqual([{ lema: 'tener', formas: 2 }]);
    });

    it('devuelve la tabla completa de un lema (formas con ʉ intactas)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/gramatica/lemas/tener')
        .expect(200);
      expect(res.body.lema).toBe('tener');
      expect(res.body.conjugaciones).toHaveLength(2);
      expect(res.body.conjugaciones[0]).toMatchObject({
        damana: 'nujkunʉnanka',
        espanol: 'yo tuve',
        lema: 'tener',
      });
    });

    it('404 para un lema inexistente', async () => {
      await request(app.getHttpServer()).get('/api/gramatica/lemas/volar').expect(404);
    });
  });

  describe('listados completos', () => {
    it('GET /api/vocabulario devuelve todas las entradas con id y categoría', async () => {
      const res = await request(app.getHttpServer()).get('/api/vocabulario').expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toMatchObject({
        id: 1,
        espanol: 'agua',
        damana: 'nʉnka',
        categoria: 'Otros',
      });
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
