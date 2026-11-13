import { Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { readEnv } from '../common/env';

export const CONFIG_AUTH = Symbol('CONFIG_AUTH');

export interface ConfigAuth {
  /** false when no credentials are configured: the API is left open. */
  active: boolean;
  user: string;
  password: string;
  /** Key used to sign session tokens. */
  secret: string;
  durationDays: number;
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
  const user = (readEnv('AUTH_USERNAME', env) ?? '').trim();
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
        'AUTH_USERNAME and/or AUTH_PASSWORD are missing. In production the API ' +
          'cannot be left open: set them in the deployment environment.',
      );
    }
    if (secret.length === 0) {
      throw new Error(
        'AUTH_JWT_SECRET is missing: without it sessions cannot be signed.',
      );
    }
  } else if (!active) {
    new Logger('Auth').warn(
      'No AUTH_USERNAME/AUTH_PASSWORD: the API is OPEN (local development).',
    );
  }

  return {
    active: active,
    user: user,
    password,
    // Locally it is generated on the fly: sessions do not survive a restart,
    // which does not matter for development.
    secret: secret || randomBytes(32).toString('hex'),
    durationDays: Number(readEnv('AUTH_SESSION_DAYS', env)) || DEFAULT_DAYS,
  };
}
