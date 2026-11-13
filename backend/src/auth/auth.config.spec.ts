import { readAuthConfig } from './auth.config';

describe('readAuthConfig', () => {
  const credentials = {
    AUTH_USERNAME: 'juan',
    AUTH_PASSWORD: 'contraseña con ʉ y ñ',
    AUTH_JWT_SECRET: 'secreto-largo-de-prueba',
  };

  it('with complete credentials it is active', () => {
    const config = readAuthConfig(credentials as NodeJS.ProcessEnv);
    expect(config.active).toBe(true);
    expect(config.user).toBe('juan');
    expect(config.durationDays).toBe(30);
  });

  it('without credentials it is disabled outside production', () => {
    expect(readAuthConfig({} as NodeJS.ProcessEnv).active).toBe(false);
  });

  it('in production without credentials it does NOT start: the API cannot be left open', () => {
    expect(() =>
      readAuthConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toThrow(/AUTH_USERNAME/);
  });

  it('in production without a signing secret it does not start either', () => {
    expect(() =>
      readAuthConfig({
        NODE_ENV: 'production',
        AUTH_USERNAME: 'juan',
        AUTH_PASSWORD: 'x',
      } as NodeJS.ProcessEnv),
    ).toThrow(/AUTH_JWT_SECRET/);
  });

  it('a blank user does not count as a credential', () => {
    const config = readAuthConfig({
      AUTH_USERNAME: '   ',
      AUTH_PASSWORD: 'x',
    } as NodeJS.ProcessEnv);
    expect(config.active).toBe(false);
  });

  it('locally it makes up a secret so it can still sign', () => {
    const config = readAuthConfig(
      { AUTH_USERNAME: 'juan', AUTH_PASSWORD: 'x' } as NodeJS.ProcessEnv,
    );
    expect(config.secret.length).toBeGreaterThanOrEqual(32);
  });

  it('honours AUTH_SESSION_DAYS', () => {
    const config = readAuthConfig({
      ...credentials,
      AUTH_SESSION_DAYS: '7',
    } as NodeJS.ProcessEnv);
    expect(config.durationDays).toBe(7);
  });
});

describe('readAuthConfig on Render', () => {
  // Render sets RENDER=true by itself; NODE_ENV cannot be used there because
  // it would break `npm ci` (it would skip the build's devDependencies).
  it('treats RENDER=true as production and requires credentials', () => {
    expect(() =>
      readAuthConfig({ RENDER: 'true' } as NodeJS.ProcessEnv),
    ).toThrow(/AUTH_USERNAME/);
  });

  it('with credentials on Render it starts and is active', () => {
    const config = readAuthConfig({
      RENDER: 'true',
      AUTH_USERNAME: 'juan',
      AUTH_PASSWORD: 'x',
      AUTH_JWT_SECRET: 'secreto',
    } as NodeJS.ProcessEnv);
    expect(config.active).toBe(true);
  });
});
