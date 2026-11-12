import { normalizar } from './normalizador';

describe('normalizar', () => {
  it('removes accents and lowercases: Jehová → jehova', () => {
    expect(normalizar('Jehová')).toBe('jehova');
  });

  it('keeps the ʉ (U+0289): nʉnka → nʉnka', () => {
    expect(normalizar('nʉnka')).toBe('nʉnka');
  });

  it('never collapses ʉ with u', () => {
    expect(normalizar('kʉnʉnka')).not.toBe(normalizar('kununka'));
  });

  // Documented decision: ñ is a full letter in Damana (ñingui, kʉñingui)
  // and in Spanish (año ≠ ano); it is preserved even though NFD decomposes it.
  it('keeps the ñ: Ñingui → ñingui', () => {
    expect(normalizar('Ñingui')).toBe('ñingui');
  });

  it('keeps the ñ also with already decomposed input (n + U+0303)', () => {
    expect(normalizar('ñingui')).toBe('ñingui');
  });

  it('removes the diaeresis but does not confuse ü with ʉ: agüita → aguita', () => {
    expect(normalizar('agüita')).toBe('aguita');
  });

  it('combines capitals, accents, ʉ and ñ in one word', () => {
    expect(normalizar('MʉGʉNTSHA Ñandú')).toBe('mʉgʉntsha ñandu');
  });
});
