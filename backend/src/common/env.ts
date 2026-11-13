/**
 * Environment variables were renamed to English in November 2026. The old
 * Spanish names are still accepted so that deployments whose secrets were
 * created with them (GitHub Actions, Kamal, Render) keep working without
 * changes. The English name always wins when both are set.
 */
export const LEGACY_ENV_NAMES: Readonly<Record<string, string>> = {
  TRANSLATOR_BASE_URL: 'TRADUCTOR_BASE_URL',
  TRANSLATOR_MODEL: 'TRADUCTOR_MODELO',
  TRANSLATOR_API_KEY: 'TRADUCTOR_API_KEY',
  TRANSLATOR_TIMEOUT_MS: 'TRADUCTOR_TIMEOUT_MS',
  TRANSLATOR_TEMPERATURE: 'TRADUCTOR_TEMPERATURA',
  ANTHROPIC_MODEL: 'ANTHROPIC_MODELO',
  ANTHROPIC_EFFORT: 'ANTHROPIC_ESFUERZO',
  AUTH_USERNAME: 'AUTH_USUARIO',
  AUTH_SESSION_DAYS: 'AUTH_DIAS_SESION',
  CORPUS_DATA_DIR: 'CORPUS_DATOS_DIR',
};

/** Reads an environment variable by its English name, falling back to its legacy name. */
export function readEnv(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[name];
  if (value !== undefined) return value;
  const legacy = LEGACY_ENV_NAMES[name];
  return legacy ? env[legacy] : undefined;
}
