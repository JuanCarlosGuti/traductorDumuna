import { aDistanciaUno, esqueletoOrtografico, reglasQueDistinguen } from './esqueleto';

describe('esqueletoOrtografico (only to detect spelling doubts)', () => {
  it('merges u and ʉ, which the rest of the app keeps apart', () => {
    expect(esqueletoOrtografico('nʉnka')).toBe(esqueletoOrtografico('nunka'));
    expect(esqueletoOrtografico('Kʉgui')).toBe(esqueletoOrtografico('kugui'));
  });

  it('merges gw/gu, kw/ku, y/i and -ndzina/-nyina', () => {
    expect(esqueletoOrtografico('Dugwa')).toBe(esqueletoOrtografico('dugua'));
    expect(esqueletoOrtografico('Kwima')).toBe(esqueletoOrtografico('Kuima'));
    expect(esqueletoOrtografico('Shaye')).toBe(esqueletoOrtografico('Shaie'));
    expect(esqueletoOrtografico('terruandzina')).toBe(esqueletoOrtografico('terruanyina'));
  });

  it('merges lone h and j but respects sh, zh and ch', () => {
    expect(esqueletoOrtografico('shihka')).toBe(esqueletoOrtografico('shijka'));
    expect(esqueletoOrtografico('zhama')).not.toBe(esqueletoOrtografico('zjama'));
    expect(esqueletoOrtografico('sha')).toBe('sha');
  });

  it('keeps the ñ: ñingui and ningui are NOT merged', () => {
    expect(esqueletoOrtografico('ñingui')).not.toBe(esqueletoOrtografico('ningui'));
    expect(esqueletoOrtografico('Ñi')).toBe('ñi');
  });

  it('ignores capitals and accents like normalizar()', () => {
    expect(esqueletoOrtografico('Akó')).toBe(esqueletoOrtografico('ako'));
  });
});

describe('reglasQueDistinguen', () => {
  it('names the alternation that separates the forms', () => {
    expect(reglasQueDistinguen(['nʉnka', 'nunka'])).toEqual(['u / ʉ']);
    expect(reglasQueDistinguen(['dugwa', 'dugua'])).toEqual(['w / u']);
    expect(reglasQueDistinguen(['shkandzina', 'shkanyina'])).toEqual(['ndzina / nyina']);
    expect(reglasQueDistinguen(['naya', 'naia'])).toEqual(['y / i']);
  });

  it('there can be several at once', () => {
    expect(reglasQueDistinguen(['bʉgui', 'bugwi', 'bugui'])).toEqual(['u / ʉ', 'w / u']);
  });
});

describe('aDistanciaUno', () => {
  it('one letter changed, extra or missing', () => {
    expect(aDistanciaUno('kunkushina', 'kunkujshina')).toBe(true);
    expect(aDistanciaUno('pastoores', 'pastores')).toBe(true);
    expect(aDistanciaUno('ñingui', 'ningui')).toBe(true);
  });

  it('equal ones or ones with two differences do not count', () => {
    expect(aDistanciaUno('nʉnka', 'nʉnka')).toBe(false);
    expect(aDistanciaUno('urraga', 'urragamba')).toBe(false);
    expect(aDistanciaUno('abisha', 'apeshi')).toBe(false);
  });
});
