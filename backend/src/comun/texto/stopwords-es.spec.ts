import { isSpanishNegation, isSpanishStopword } from './stopwords-es';

describe('Spanish stopwords and negations', () => {
  it('«no», «ni» and «nada» are stopwords AND negations; «nunca» and «jamás» only negations', () => {
    for (const p of ['no', 'ni', 'nada']) {
      expect(isSpanishStopword(p)).toBe(true);
      expect(isSpanishNegation(p)).toBe(true);
    }
    expect(isSpanishNegation('nunca')).toBe(true);
    expect(isSpanishNegation('jamas')).toBe(true); // already normalized (no accent)
    expect(isSpanishStopword('nunca')).toBe(false);
  });

  it('content words are neither (with ñ and with ʉ)', () => {
    expect(isSpanishStopword('ñame')).toBe(false);
    expect(isSpanishNegation('ñame')).toBe(false);
    expect(isSpanishStopword('nʉnka')).toBe(false);
    expect(isSpanishNegation('nʉnka')).toBe(false);
  });
});
