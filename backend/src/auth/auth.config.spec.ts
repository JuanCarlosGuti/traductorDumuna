import { leerConfigAuth } from './auth.config';

describe('leerConfigAuth', () => {
  const credenciales = {
    AUTH_USUARIO: 'juan',
    AUTH_PASSWORD: 'contraseña con ʉ y ñ',
    AUTH_JWT_SECRET: 'secreto-largo-de-prueba',
  };

  it('con credenciales completas queda activa', () => {
    const config = leerConfigAuth(credenciales as NodeJS.ProcessEnv);
    expect(config.activa).toBe(true);
    expect(config.usuario).toBe('juan');
    expect(config.duracionDias).toBe(30);
  });

  it('sin credenciales queda desactivada fuera de producción', () => {
    expect(leerConfigAuth({} as NodeJS.ProcessEnv).activa).toBe(false);
  });

  it('en producción sin credenciales NO arranca: la API no puede quedar abierta', () => {
    expect(() =>
      leerConfigAuth({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toThrow(/AUTH_USUARIO/);
  });

  it('en producción sin secreto de firma tampoco arranca', () => {
    expect(() =>
      leerConfigAuth({
        NODE_ENV: 'production',
        AUTH_USUARIO: 'juan',
        AUTH_PASSWORD: 'x',
      } as NodeJS.ProcessEnv),
    ).toThrow(/AUTH_JWT_SECRET/);
  });

  it('un usuario en blanco no cuenta como credencial', () => {
    const config = leerConfigAuth({
      AUTH_USUARIO: '   ',
      AUTH_PASSWORD: 'x',
    } as NodeJS.ProcessEnv);
    expect(config.activa).toBe(false);
  });

  it('en local inventa un secreto para poder firmar igualmente', () => {
    const config = leerConfigAuth(
      { AUTH_USUARIO: 'juan', AUTH_PASSWORD: 'x' } as NodeJS.ProcessEnv,
    );
    expect(config.secreto.length).toBeGreaterThanOrEqual(32);
  });

  it('respeta AUTH_DIAS_SESION', () => {
    const config = leerConfigAuth({
      ...credenciales,
      AUTH_DIAS_SESION: '7',
    } as NodeJS.ProcessEnv);
    expect(config.duracionDias).toBe(7);
  });
});

describe('leerConfigAuth en Render', () => {
  // Render define RENDER=true sola; NODE_ENV no se puede usar allí porque
  // rompería `npm ci` (omitiría las devDependencies del build).
  it('trata RENDER=true como producción y exige credenciales', () => {
    expect(() =>
      leerConfigAuth({ RENDER: 'true' } as NodeJS.ProcessEnv),
    ).toThrow(/AUTH_USUARIO/);
  });

  it('con credenciales en Render arranca y queda activa', () => {
    const config = leerConfigAuth({
      RENDER: 'true',
      AUTH_USUARIO: 'juan',
      AUTH_PASSWORD: 'x',
      AUTH_JWT_SECRET: 'secreto',
    } as NodeJS.ProcessEnv);
    expect(config.activa).toBe(true);
  });
});
