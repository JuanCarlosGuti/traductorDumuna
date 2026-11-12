import { leerConfigAuth } from './auth.config';

describe('leerConfigAuth', () => {
  const credenciales = {
    AUTH_USUARIO: 'juan',
    AUTH_PASSWORD: 'contraseña con ʉ y ñ',
    AUTH_JWT_SECRET: 'secreto-largo-de-prueba',
  };

  it('with complete credentials it is active', () => {
    const config = leerConfigAuth(credenciales as NodeJS.ProcessEnv);
    expect(config.activa).toBe(true);
    expect(config.usuario).toBe('juan');
    expect(config.duracionDias).toBe(30);
  });

  it('without credentials it is disabled outside production', () => {
    expect(leerConfigAuth({} as NodeJS.ProcessEnv).activa).toBe(false);
  });

  it('in production without credentials it does NOT start: the API cannot be left open', () => {
    expect(() =>
      leerConfigAuth({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toThrow(/AUTH_USUARIO/);
  });

  it('in production without a signing secret it does not start either', () => {
    expect(() =>
      leerConfigAuth({
        NODE_ENV: 'production',
        AUTH_USUARIO: 'juan',
        AUTH_PASSWORD: 'x',
      } as NodeJS.ProcessEnv),
    ).toThrow(/AUTH_JWT_SECRET/);
  });

  it('a blank user does not count as a credential', () => {
    const config = leerConfigAuth({
      AUTH_USUARIO: '   ',
      AUTH_PASSWORD: 'x',
    } as NodeJS.ProcessEnv);
    expect(config.activa).toBe(false);
  });

  it('locally it makes up a secret so it can still sign', () => {
    const config = leerConfigAuth(
      { AUTH_USUARIO: 'juan', AUTH_PASSWORD: 'x' } as NodeJS.ProcessEnv,
    );
    expect(config.secreto.length).toBeGreaterThanOrEqual(32);
  });

  it('honours AUTH_DIAS_SESION', () => {
    const config = leerConfigAuth({
      ...credenciales,
      AUTH_DIAS_SESION: '7',
    } as NodeJS.ProcessEnv);
    expect(config.duracionDias).toBe(7);
  });
});

describe('leerConfigAuth on Render', () => {
  // Render sets RENDER=true by itself; NODE_ENV cannot be used there because
  // it would break `npm ci` (it would skip the build's devDependencies).
  it('treats RENDER=true as production and requires credentials', () => {
    expect(() =>
      leerConfigAuth({ RENDER: 'true' } as NodeJS.ProcessEnv),
    ).toThrow(/AUTH_USUARIO/);
  });

  it('with credentials on Render it starts and is active', () => {
    const config = leerConfigAuth({
      RENDER: 'true',
      AUTH_USUARIO: 'juan',
      AUTH_PASSWORD: 'x',
      AUTH_JWT_SECRET: 'secreto',
    } as NodeJS.ProcessEnv);
    expect(config.activa).toBe(true);
  });
});
