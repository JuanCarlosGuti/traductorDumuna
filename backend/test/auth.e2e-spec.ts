import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
import { ConfigAuth } from '../src/auth/auth.config';
import { MAX_INTENTOS } from '../src/auth/auth.service';
import { configurarApp } from '../src/configurar-app';
import { ConsultaModule } from '../src/consulta/consulta.module';
import { DatabaseModule } from '../src/database/database.module';
import { ImportadorModule } from '../src/importador/importador.module';
import { ImportadorService } from '../src/importador/importador.service';

const BOM = String.fromCharCode(0xfeff);
const USUARIO = 'juan';
const PASSWORD = 'ñandú-ʉnkua-2026';

const config: ConfigAuth = {
  activa: true,
  usuario: USUARIO,
  password: PASSWORD,
  secreto: 'secreto-e2e-suficientemente-largo-para-firmar',
  duracionDias: 30,
};

/** Corpus mínimo: basta con que /api/buscar tenga algo que devolver. */
function escribirCorpus(dir: string): void {
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
    path.join(dir, 'corpus_vocabulario_v2.csv'),
    BOM + 'espanol,damana,categoria,notas,fuente\nagua,nʉnka,Otros,,dic\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'corpus_conjugaciones.csv'),
    BOM + 'damana,espanol,lema,fuente,notas\n',
    'utf8',
  );
}

async function crearApp(configAuth: ConfigAuth): Promise<{
  app: INestApplication;
  dirTmp: string;
}> {
  const dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-auth-'));
  escribirCorpus(dirTmp);
  const moduleRef = await Test.createTestingModule({
    imports: [
      AuthModule.forRoot(configAuth),
      DatabaseModule.forRoot({ rutaDb: ':memory:' }),
      ImportadorModule,
      ConsultaModule,
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  configurarApp(app);
  await app.init();
  app.get(ImportadorService).importarTodo(dirTmp);
  return { app, dirTmp };
}

describe('Autenticación (e2e)', () => {
  let app: INestApplication;
  let dirTmp: string;

  beforeEach(async () => {
    ({ app, dirTmp } = await crearApp(config));
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(dirTmp, { recursive: true, force: true });
  });

  const entrar = () =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: USUARIO, password: PASSWORD })
      .expect(200);

  it('sin token, el corpus queda cerrado', async () => {
    await request(app.getHttpServer())
      .get('/api/buscar')
      .query({ q: 'nʉnka' })
      .expect(401);
  });

  it('el estado de la auth es público: la app necesita saberlo antes de entrar', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/estado')
      .expect(200);
    expect(res.body).toEqual({ activa: true });
  });

  it('con las credenciales correctas devuelve token y abre el corpus', async () => {
    const login = await entrar();
    expect(login.body.usuario).toBe(USUARIO);
    expect(typeof login.body.token).toBe('string');

    const res = await request(app.getHttpServer())
      .get('/api/buscar')
      .query({ q: 'nʉnka' })
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('la contraseña con u en vez de ʉ no entra', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: USUARIO, password: 'ñandú-unkua-2026' })
      .expect(401);
  });

  it('el mensaje de error no revela si falló el usuario o la contraseña', async () => {
    const malUsuario = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: 'otro', password: PASSWORD })
      .expect(401);
    const malPassword = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: USUARIO, password: 'otra' })
      .expect(401);
    expect(malUsuario.body.message).toBe(malPassword.body.message);
  });

  it('un token manipulado no sirve', async () => {
    const { body } = await entrar();
    await request(app.getHttpServer())
      .get('/api/buscar')
      .query({ q: 'nʉnka' })
      .set('Authorization', `Bearer ${body.token.slice(0, -3)}aaa`)
      .expect(401);
  });

  it('/api/auth/sesion confirma quién eres', async () => {
    const { body } = await entrar();
    const res = await request(app.getHttpServer())
      .get('/api/auth/sesion')
      .set('Authorization', `Bearer ${body.token}`)
      .expect(200);
    expect(res.body).toEqual({ usuario: USUARIO });
  });

  it('tras demasiados intentos fallidos responde 429', async () => {
    for (let i = 0; i < MAX_INTENTOS; i++) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ usuario: USUARIO, password: 'incorrecta' })
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: USUARIO, password: PASSWORD })
      .expect(429);
  });

  it('el guard es global: cierra todos los controladores, no solo uno', async () => {
    // Rutas de controladores distintos; ninguna está marcada como pública.
    for (const ruta of ['/api/vocabulario', '/api/frases', '/api/gramatica/lemas']) {
      await request(app.getHttpServer()).get(ruta).expect(401);
    }
  });
});

describe('Autenticación desactivada (desarrollo local)', () => {
  let app: INestApplication;
  let dirTmp: string;

  beforeAll(async () => {
    ({ app, dirTmp } = await crearApp({ ...config, activa: false }));
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(dirTmp, { recursive: true, force: true });
  });

  it('sin credenciales configuradas la API responde sin token', async () => {
    await request(app.getHttpServer())
      .get('/api/buscar')
      .query({ q: 'nʉnka' })
      .expect(200);
  });

  it('y lo anuncia en /api/auth/estado para que la app no pida login', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/estado')
      .expect(200);
    expect(res.body).toEqual({ activa: false });
  });
});
