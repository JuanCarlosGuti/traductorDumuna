import { Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';

export const CONFIG_AUTH = Symbol('CONFIG_AUTH');

export interface ConfigAuth {
  /** false when no credentials are configured: the API is left open. */
  activa: boolean;
  usuario: string;
  password: string;
  /** Key used to sign session tokens. */
  secreto: string;
  duracionDias: number;
}

const DEFAULT_DAYS = 30;

/**
 * Reads the credentials from the environment. If they are missing, authentication is
 * disabled… except in production, where that would be a public API without
 * anyone noticing: there we prefer startup to fail visibly.
 */
export function readAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): ConfigAuth {
  const user = (env.AUTH_USUARIO ?? '').trim();
  const password = env.AUTH_PASSWORD ?? '';
  const secret = env.AUTH_JWT_SECRET ?? '';
  // RENDER is set by the platform itself. It is checked in addition to NODE_ENV because
  // NODE_ENV=production cannot be set on Render: it would make `npm ci`
  // skip the devDependencies and the build would be left without compilers.
  const production = env.NODE_ENV === 'production' || env.RENDER === 'true';
  const active = user.length > 0 && password.length > 0;

  if (production) {
    if (!active) {
      throw new Error(
        'Faltan AUTH_USUARIO y/o AUTH_PASSWORD. En producción la API no ' +
          'puede quedar abierta: configúralas en el panel de Render.',
      );
    }
    if (secret.length === 0) {
      throw new Error(
        'Falta AUTH_JWT_SECRET: sin él no se pueden firmar las sesiones.',
      );
    }
  } else if (!active) {
    new Logger('Auth').warn(
      'Sin AUTH_USUARIO/AUTH_PASSWORD: la API queda ABIERTA (desarrollo local).',
    );
  }

  return {
    activa: active,
    usuario: user,
    password,
    // Locally it is generated on the fly: sessions do not survive a restart,
    // which does not matter for development.
    secreto: secret || randomBytes(32).toString('hex'),
    duracionDias: Number(env.AUTH_DIAS_SESION) || DEFAULT_DAYS,
  };
}
