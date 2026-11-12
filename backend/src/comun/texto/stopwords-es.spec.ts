import { esNegacionEspanol, esStopwordEspanol } from './stopwords-es';

describe('Spanish stopwords and negations', () => {
  it('«no», «ni» and «nada» are stopwords AND negations; «nunca» and «jamás» only negations', () => {
    for (const p of ['no', 'ni', 'nada']) {
      expect(esStopwordEspanol(p)).toBe(true);
      expect(esNegacionEspanol(p)).toBe(true);
    }
    expect(esNegacionEspanol('nunca')).toBe(true);
    expect(esNegacionEspanol('jamas')).toBe(true); // already normalized (no accent)
    expect(esStopwordEspanol('nunca')).toBe(false);
  });

  it('content words are neither (with ñ and with ʉ)', () => {
    expect(esStopwordEspanol('ñame')).toBe(false);
    expect(esNegacionEspanol('ñame')).toBe(false);
    expect(esStopwordEspanol('nʉnka')).toBe(false);
    expect(esNegacionEspanol('nʉnka')).toBe(false);
  });
});
