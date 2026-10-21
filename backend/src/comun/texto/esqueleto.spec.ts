import { aDistanciaUno, esqueletoOrtografico, reglasQueDistinguen } from './esqueleto';

describe('esqueletoOrtografico (solo para detectar dudas de escritura)', () => {
  it('junta u y ʉ, que el resto de la app mantiene separadas', () => {
    expect(esqueletoOrtografico('nʉnka')).toBe(esqueletoOrtografico('nunka'));
    expect(esqueletoOrtografico('Kʉgui')).toBe(esqueletoOrtografico('kugui'));
  });

  it('junta gw/gu, kw/ku, y/i y -ndzina/-nyina', () => {
    expect(esqueletoOrtografico('Dugwa')).toBe(esqueletoOrtografico('dugua'));
    expect(esqueletoOrtografico('Kwima')).toBe(esqueletoOrtografico('Kuima'));
    expect(esqueletoOrtografico('Shaye')).toBe(esqueletoOrtografico('Shaie'));
    expect(esqueletoOrtografico('terruandzina')).toBe(esqueletoOrtografico('terruanyina'));
  });

  it('junta h y j sueltas pero respeta sh, zh y ch', () => {
    expect(esqueletoOrtografico('shihka')).toBe(esqueletoOrtografico('shijka'));
    expect(esqueletoOrtografico('zhama')).not.toBe(esqueletoOrtografico('zjama'));
    expect(esqueletoOrtografico('sha')).toBe('sha');
  });

  it('conserva la ñ: ñingui y ningui NO se juntan', () => {
    expect(esqueletoOrtografico('ñingui')).not.toBe(esqueletoOrtografico('ningui'));
    expect(esqueletoOrtografico('Ñi')).toBe('ñi');
  });

  it('ignora mayúsculas y tildes como normalizar()', () => {
    expect(esqueletoOrtografico('Akó')).toBe(esqueletoOrtografico('ako'));
  });
});

describe('reglasQueDistinguen', () => {
  it('nombra la alternancia que separa las formas', () => {
    expect(reglasQueDistinguen(['nʉnka', 'nunka'])).toEqual(['u / ʉ']);
    expect(reglasQueDistinguen(['dugwa', 'dugua'])).toEqual(['w / u']);
    expect(reglasQueDistinguen(['shkandzina', 'shkanyina'])).toEqual(['ndzina / nyina']);
    expect(reglasQueDistinguen(['naya', 'naia'])).toEqual(['y / i']);
  });

  it('puede haber varias a la vez', () => {
    expect(reglasQueDistinguen(['bʉgui', 'bugwi', 'bugui'])).toEqual(['u / ʉ', 'w / u']);
  });
});

describe('aDistanciaUno', () => {
  it('una letra cambiada, de más o de menos', () => {
    expect(aDistanciaUno('kunkushina', 'kunkujshina')).toBe(true);
    expect(aDistanciaUno('pastoores', 'pastores')).toBe(true);
    expect(aDistanciaUno('ñingui', 'ningui')).toBe(true);
  });

  it('iguales o con dos diferencias no cuentan', () => {
    expect(aDistanciaUno('nʉnka', 'nʉnka')).toBe(false);
    expect(aDistanciaUno('urraga', 'urragamba')).toBe(false);
    expect(aDistanciaUno('abisha', 'apeshi')).toBe(false);
  });
});
