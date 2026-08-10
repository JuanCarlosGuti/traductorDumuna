import { Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';

export const CONFIG_AUTH = Symbol('CONFIG_AUTH');

export interface ConfigAuth {
  /** false cuando no hay credenciales configuradas: la API queda abierta. */
  activa: boolean;
  usuario: string;
  password: string;
  /** Clave con la que se firman los tokens de sesión. */
  secreto: string;
  duracionDias: number;
}

const DIAS_POR_DEFECTO = 30;

/**
 * Lee las credenciales del entorno. Si faltan, la autenticación queda
 * desactivada… salvo en producción, donde eso sería una API pública sin
 * que nadie se entere: ahí se prefiere que el arranque falle y se vea.
 */
export function leerConfigAuth(
  env: NodeJS.ProcessEnv = process.env,
): ConfigAuth {
  const usuario = (env.AUTH_USUARIO ?? '').trim();
  const password = env.AUTH_PASSWORD ?? '';
  const secreto = env.AUTH_JWT_SECRET ?? '';
  // RENDER la define la plataforma sola. Se mira además de NODE_ENV porque
  // NODE_ENV=production no se puede poner en Render: haría que `npm ci`
  // omitiera las devDependencies y el build se quedaría sin compiladores.
  const produccion = env.NODE_ENV === 'production' || env.RENDER === 'true';
  const activa = usuario.length > 0 && password.length > 0;

  if (produccion) {
    if (!activa) {
      throw new Error(
        'Faltan AUTH_USUARIO y/o AUTH_PASSWORD. En producción la API no ' +
          'puede quedar abierta: configúralas en el panel de Render.',
      );
    }
    if (secreto.length === 0) {
      throw new Error(
        'Falta AUTH_JWT_SECRET: sin él no se pueden firmar las sesiones.',
      );
    }
  } else if (!activa) {
    new Logger('Auth').warn(
      'Sin AUTH_USUARIO/AUTH_PASSWORD: la API queda ABIERTA (desarrollo local).',
    );
  }

  return {
    activa,
    usuario,
    password,
    // En local se genera al vuelo: las sesiones no sobreviven al reinicio,
    // lo que para desarrollo da igual.
    secreto: secreto || randomBytes(32).toString('hex'),
    duracionDias: Number(env.AUTH_DIAS_SESION) || DIAS_POR_DEFECTO,
  };
}
