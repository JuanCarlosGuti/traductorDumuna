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

const BOM = String.fromCharCode(0xfeff);

describe('REST API (e2e, in-memory SQLite with mini-corpus v3)', () => {
  let dirTmp: string;
  let app: INestApplication;

  beforeAll(async () => {
    // Mini-corpus: nʉnka appears in sentences, phrases and vocabulary;
    // Jehovága only capitalized (probable proper name); 'agua' is the
    // Spanish word that co-occurs with nʉnka in all the parallels.
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
      path.join(dirTmp, 'corpus_vocabulario_v3.csv'),
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
        DatabaseModule.forRoot({ dbPath: ':memory:' }),
        ImporterModule,
        QueryModule,
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

  describe('GET /api/search', () => {
    it('Damana concordance with ʉ: <mark>, reference and parallel text', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/search')
        .query({ q: 'nʉnka' })
        .expect(200);
      expect(res.body.total).toBe(4); // 2 sentences, 1 phrase, 1 vocabulary
      const sentence = res.body.results[0];
      expect(sentence.source).toBe('sentences');
      expect(sentence.reference).toBe('oración 1');
      expect(sentence.fragment).toContain('<mark>nʉnka</mark>');
      expect(sentence.parallelText).toContain('Jehová hizo el agua');
      const sources = res.body.results.map((r: any) => r.source);
      expect(sources).toContain('phrases');
      expect(sources).toContain('vocabulary');
      // the sentence with doubtful alignment is flagged
      const references = res.body.results.map((r: any) => r.reference);
      expect(references).toContain('oración 2 (revisar)');
    });

    it('never degrades ʉ to u: searching nunka finds nothing', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/search')
        .query({ q: 'nunka' })
        .expect(200);
      expect(res.body.total).toBe(0);
    });

    it('searches in Spanish (accent-insensitive) with the Damana as parallel', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/search')
        .query({ q: 'jehova', language: 'spanish' })
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.results[0].fragment).toContain('<mark>Jehová</mark>');
      expect(res.body.results[0].parallelText).toContain('Jehovága');
    });

    it('filters by source, conjugations included', async () => {
      const phrases = await request(app.getHttpServer())
        .get('/api/search')
        .query({ q: 'nʉnka', source: 'phrases' })
        .expect(200);
      expect(phrases.body.total).toBe(1);
      expect(phrases.body.results[0].reference).toBe('frase 1 (Prueba)');

      const conjugations = await request(app.getHttpServer())
        .get('/api/search')
        .query({ q: 'nujkunʉnanka', source: 'conjugations' })
        .expect(200);
      expect(conjugations.body.total).toBe(1);
      expect(conjugations.body.results[0].reference).toBe('conjugación 1 (tener)');
      expect(conjugations.body.results[0].parallelText).toBe('yo tuve');
    });

    it('a multi-word phrase searches by similarity with score and highlighting', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/search')
        .query({ q: 'jehova hizo el agua', language: 'spanish' })
        .expect(200);
      expect(res.body.mode).toBe('similarity');
      expect(res.body.total).toBeGreaterThan(0);
      const firstItem = res.body.results[0];
      expect(firstItem.reference).toBe('oración 1');
      expect(firstItem.score).toBeGreaterThan(0);
      expect(firstItem.fragment).toContain('<mark>Jehová</mark>');
      expect(firstItem.fragment).toContain('<mark>agua</mark>');
      expect(firstItem.parallelText).toContain('Jehovága');
    });

    it('validates idioma and q: 400 for invalid values', async () => {
      await request(app.getHttpServer())
        .get('/api/search')
        .query({ q: 'nʉnka', language: 'klingon' })
        .expect(400);
      await request(app.getHttpServer())
        .get('/api/search')
        .query({ q: 'nʉnka', source: 'chapters' })
        .expect(400);
      await request(app.getHttpServer()).get('/api/search').expect(400);
    });
  });

  describe('GET /api/word/:token', () => {
    it('full card of a word with ʉ', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/word/${encodeURIComponent('nʉnka')}`)
        .expect(200);
      expect(res.body.word).toBe('nʉnka');
      expect(res.body.vocabularyEntries).toEqual([
        { spanish: 'agua', category: 'Otros', notes: '', source: 'dic' },
      ]);
      expect(res.body.totalFrequency).toBe(4);
      expect(res.body.frequencyBySource).toEqual([
        { source: 'phrases', frequency: 1 },
        { source: 'sentences', frequency: 2 },
        { source: 'vocabulary', frequency: 1 },
      ]);
      expect(res.body.concordances.length).toBeLessThanOrEqual(10);
      expect(res.body.concordances[0].fragment).toContain('<mark>nʉnka</mark>');
      expect(res.body.candidateTranslations[0].word).toBe('agua');
      const candidateWords = res.body.candidateTranslations.map((c: any) => c.word);
      expect(candidateWords).not.toContain('el');
      expect(candidateWords).not.toContain('del');
    });

    it('404 for words outside the corpus', async () => {
      await request(app.getHttpServer()).get('/api/word/inexistente').expect(404);
    });
  });

  describe('GET /api/frequencies', () => {
    it('excludes probable proper names and brings the vocabulary category', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/frequencies')
        .expect(200);
      const words = res.body.map((f: any) => f.word);
      expect(words).toContain('nʉnka');
      expect(words).not.toContain('jehovaga'); // only 'Jehovága'
      expect(res.body[0]).toEqual({
        word: 'nʉnka',
        frequency: 4,
        translation: 'agua',
        category: 'Otros',
      });
    });

    it('respects limite and validates that it is a positive integer', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/frequencies')
        .query({ limit: 1 })
        .expect(200);
      expect(res.body).toHaveLength(1);
      await request(app.getHttpServer())
        .get('/api/frequencies')
        .query({ limit: 'muchas' })
        .expect(400);
    });
  });

  describe('GET /api/grammar', () => {
    it('lists the lemmas with their number of forms', async () => {
      const res = await request(app.getHttpServer()).get('/api/grammar/lemmas').expect(200);
      expect(res.body).toEqual([{ lemma: 'tener', forms: 2 }]);
    });

    it('returns the full table of a lemma (forms with ʉ intact)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/grammar/lemmas/tener')
        .expect(200);
      expect(res.body.lemma).toBe('tener');
      expect(res.body.conjugations).toHaveLength(2);
      expect(res.body.conjugations[0]).toMatchObject({
        damana: 'nujkunʉnanka',
        spanish: 'yo tuve',
        lemma: 'tener',
      });
    });

    it('404 for a nonexistent lemma', async () => {
      await request(app.getHttpServer()).get('/api/grammar/lemmas/volar').expect(404);
    });
  });

  describe('full listings', () => {
    it('GET /api/vocabulary returns all entries with id and category', async () => {
      const res = await request(app.getHttpServer()).get('/api/vocabulary').expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toMatchObject({
        id: 1,
        spanish: 'agua',
        damana: 'nʉnka',
        category: 'Otros',
      });
    });

    it('GET /api/phrases returns all phrases with id', async () => {
      const res = await request(app.getHttpServer()).get('/api/phrases').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: 1,
        source: 'Prueba',
        damana: '¿Zhinzhoma nʉnka nanu?',
      });
    });
  });
});
