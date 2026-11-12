import { normalize } from './normalizador';

describe('normalizar', () => {
  it('removes accents and lowercases: Jehová → jehova', () => {
    expect(normalize('Jehová')).toBe('jehova');
  });

  it('keeps the ʉ (U+0289): nʉnka → nʉnka', () => {
    expect(normalize('nʉnka')).toBe('nʉnka');
  });

  it('never collapses ʉ with u', () => {
    expect(normalize('kʉnʉnka')).not.toBe(normalize('kununka'));
  });

  // Documented decision: ñ is a full letter in Damana (ñingui, kʉñingui)
  // and in Spanish (año ≠ ano); it is preserved even though NFD decomposes it.
  it('keeps the ñ: Ñingui → ñingui', () => {
    expect(normalize('Ñingui')).toBe('ñingui');
  });

  it('keeps the ñ also with already decomposed input (n + U+0303)', () => {
    expect(normalize('ñingui')).toBe('ñingui');
  });

  it('removes the diaeresis but does not confuse ü with ʉ: agüita → aguita', () => {
    expect(normalize('agüita')).toBe('aguita');
  });

  it('combines capitals, accents, ʉ and ñ in one word', () => {
    expect(normalize('MʉGʉNTSHA Ñandú')).toBe('mʉgʉntsha ñandu');
  });
});
