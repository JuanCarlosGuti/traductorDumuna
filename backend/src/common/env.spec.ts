import { readEnv } from './env';

describe('readEnv', () => {
  it('reads the English name', () => {
    expect(readEnv('TRANSLATOR_MODEL', { TRANSLATOR_MODEL: 'groq' })).toBe('groq');
  });

  it('falls back to the legacy Spanish name', () => {
    expect(readEnv('AUTH_USERNAME', { AUTH_USUARIO: 'juan' })).toBe('juan');
  });

  it('prefers the English name when both are set', () => {
    expect(readEnv('TRANSLATOR_API_KEY', { TRANSLATOR_API_KEY: 'new', TRADUCTOR_API_KEY: 'old' })).toBe('new');
  });

  it('returns undefined when neither is set', () => {
    expect(readEnv('ANTHROPIC_EFFORT', {})).toBeUndefined();
  });
});
