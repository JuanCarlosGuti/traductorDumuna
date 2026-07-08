import { normalizar } from './normalizador';

describe('normalizar', () => {
  it('quita tildes y pasa a minúsculas: Jehová → jehova', () => {
    expect(normalizar('Jehová')).toBe('jehova');
  });

  it('conserva la ʉ (U+0289): nʉnka → nʉnka', () => {
    expect(normalizar('nʉnka')).toBe('nʉnka');
  });

  it('nunca colapsa ʉ con u', () => {
    expect(normalizar('kʉnʉnka')).not.toBe(normalizar('kununka'));
  });

  // Decisión documentada: ñ es letra plena en damana (ñingui, kʉñingui)
  // y en español (año ≠ ano); se preserva aunque NFD la descomponga.
  it('conserva la ñ: Ñingui → ñingui', () => {
    expect(normalizar('Ñingui')).toBe('ñingui');
  });

  it('conserva la ñ también con entrada ya descompuesta (n + U+0303)', () => {
    expect(normalizar('ñingui')).toBe('ñingui');
  });

  it('quita la diéresis pero no confunde ü con ʉ: agüita → aguita', () => {
    expect(normalizar('agüita')).toBe('aguita');
  });

  it('combina mayúsculas, tildes, ʉ y ñ en una palabra', () => {
    expect(normalizar('MʉGʉNTSHA Ñandú')).toBe('mʉgʉntsha ñandu');
  });
});
