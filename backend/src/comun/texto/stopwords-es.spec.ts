import { esNegacionEspanol, esStopwordEspanol } from './stopwords-es';

describe('stopwords y negaciones del español', () => {
  it('«no», «ni» y «nada» son stopwords Y negaciones; «nunca» y «jamás» solo negaciones', () => {
    for (const p of ['no', 'ni', 'nada']) {
      expect(esStopwordEspanol(p)).toBe(true);
      expect(esNegacionEspanol(p)).toBe(true);
    }
    expect(esNegacionEspanol('nunca')).toBe(true);
    expect(esNegacionEspanol('jamas')).toBe(true); // ya normalizada (sin tilde)
    expect(esStopwordEspanol('nunca')).toBe(false);
  });

  it('las palabras de contenido no son ni lo uno ni lo otro (con ñ y con ʉ)', () => {
    expect(esStopwordEspanol('ñame')).toBe(false);
    expect(esNegacionEspanol('ñame')).toBe(false);
    expect(esStopwordEspanol('nʉnka')).toBe(false);
    expect(esNegacionEspanol('nʉnka')).toBe(false);
  });
});
