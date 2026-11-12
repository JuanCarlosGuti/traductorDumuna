import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
import { ConfigAuth } from '../src/auth/auth.config';
import { MAX_ATTEMPTS } from '../src/auth/auth.service';
import { configureApp } from '../src/configure-app';
import { QueryModule } from '../src/query/query.module';
import { DatabaseModule } from '../src/database/database.module';
import { ImporterModule } from '../src/importer/importer.module';
import { ImporterService } from '../src/importer/importer.service';

const BOM = String.fromCharCode(0xfeff);
const USER = 'juan';
const PASSWORD = 'ñandú-ʉnkua-2026';

const config: ConfigAuth = {
  active: true,
  user: USER,
  password: PASSWORD,
  secret: 'secreto-e2e-suficientemente-largo-para-firmar',
  durationDays: 30,
};

/** Minimal corpus: it is enough for /api/search to have something to return. */
function writeCorpus(dir: string): void {
  fs.writeFileSync(
    path.join(dir, 'corpus_oraciones.csv'),
    BOM +
      'id,damana,espanol,estado,fuente\n' +
      'o1,nʉnka ñingui,el agua otra vez,aprobado,lfb\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'corpus_frases_v2.csv'),
    BOM + 'fuente,damana,espanol,notas\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'corpus_vocabulario_v3.csv'),
    BOM + 'espanol,damana,categoria,notas,fuente\nagua,nʉnka,Otros,,dic\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'corpus_conjugaciones.csv'),
    BOM + 'damana,espanol,lema,fuente,notas\n',
    'utf8',
  );
}

async function createApp(configAuth: ConfigAuth): Promise<{
  app: INestApplication;
  dirTmp: string;
}> {
  const dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-auth-'));
  writeCorpus(dirTmp);
  const moduleRef = await Test.createTestingModule({
    imports: [
      AuthModule.forRoot(configAuth),
      DatabaseModule.forRoot({ dbPath: ':memory:' }),
      ImporterModule,
      QueryModule,
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  await app.get(ImporterService).importAll(dirTmp);
  return { app, dirTmp };
}

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let dirTmp: string;

  beforeEach(async () => {
    ({ app, dirTmp } = await createApp(config));
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(dirTmp, { recursive: true, force: true });
  });

  const signIn = () =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ user: USER, password: PASSWORD })
      .expect(200);

  it('without a token, the corpus stays closed', async () => {
    await request(app.getHttpServer())
      .get('/api/search')
      .query({ q: 'nʉnka' })
      .expect(401);
  });

  it('the auth state is public: the app needs to know it before logging in', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/status')
      .expect(200);
    expect(res.body).toEqual({ active: true });
  });

  it('with the correct credentials it returns a token and opens the corpus', async () => {
    const login = await signIn();
    expect(login.body.user).toBe(USER);
    expect(typeof login.body.token).toBe('string');

    const res = await request(app.getHttpServer())
      .get('/api/search')
      .query({ q: 'nʉnka' })
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('the password with u instead of ʉ does not get in', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ user: USER, password: 'ñandú-unkua-2026' })
      .expect(401);
  });

  it('the error message does not reveal whether the user or the password failed', async () => {
    const badUser = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ user: 'otro', password: PASSWORD })
      .expect(401);
    const badPassword = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ user: USER, password: 'otra' })
      .expect(401);
    expect(badUser.body.message).toBe(badPassword.body.message);
  });

  it('a tampered token does not work', async () => {
    const { body } = await signIn();
    await request(app.getHttpServer())
      .get('/api/search')
      .query({ q: 'nʉnka' })
      .set('Authorization', `Bearer ${body.token.slice(0, -3)}aaa`)
      .expect(401);
  });

  it('/api/auth/session confirms who you are', async () => {
    const { body } = await signIn();
    const res = await request(app.getHttpServer())
      .get('/api/auth/session')
      .set('Authorization', `Bearer ${body.token}`)
      .expect(200);
    expect(res.body).toEqual({ user: USER });
  });

  it('after too many failed attempts it answers 429', async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ user: USER, password: 'incorrecta' })
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ user: USER, password: PASSWORD })
      .expect(429);
  });

  it('the guard is global: it closes all controllers, not just one', async () => {
    // Routes from different controllers; none is marked as public.
    for (const filePath of ['/api/vocabulary', '/api/phrases', '/api/grammar/lemmas']) {
      await request(app.getHttpServer()).get(filePath).expect(401);
    }
  });
});

describe('Authentication disabled (local development)', () => {
  let app: INestApplication;
  let dirTmp: string;

  beforeAll(async () => {
    ({ app, dirTmp } = await createApp({ ...config, active: false }));
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(dirTmp, { recursive: true, force: true });
  });

  it('with no credentials configured the API answers without a token', async () => {
    await request(app.getHttpServer())
      .get('/api/search')
      .query({ q: 'nʉnka' })
      .expect(200);
  });

  it('and announces it at /api/auth/status so the app does not ask for login', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/status')
      .expect(200);
    expect(res.body).toEqual({ active: false });
  });
});
