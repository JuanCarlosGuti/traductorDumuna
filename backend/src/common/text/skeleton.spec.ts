import { atDistanceOne, spellingSkeleton, distinguishingRules } from './skeleton';

describe('spellingSkeleton (only to detect spelling doubts)', () => {
  it('merges u and ʉ, which the rest of the app keeps apart', () => {
    expect(spellingSkeleton('nʉnka')).toBe(spellingSkeleton('nunka'));
    expect(spellingSkeleton('Kʉgui')).toBe(spellingSkeleton('kugui'));
  });

  it('merges gw/gu, kw/ku, y/i and -ndzina/-nyina', () => {
    expect(spellingSkeleton('Dugwa')).toBe(spellingSkeleton('dugua'));
    expect(spellingSkeleton('Kwima')).toBe(spellingSkeleton('Kuima'));
    expect(spellingSkeleton('Shaye')).toBe(spellingSkeleton('Shaie'));
    expect(spellingSkeleton('terruandzina')).toBe(spellingSkeleton('terruanyina'));
  });

  it('merges lone h and j but respects sh, zh and ch', () => {
    expect(spellingSkeleton('shihka')).toBe(spellingSkeleton('shijka'));
    expect(spellingSkeleton('zhama')).not.toBe(spellingSkeleton('zjama'));
    expect(spellingSkeleton('sha')).toBe('sha');
  });

  it('keeps the ñ: ñingui and ningui are NOT merged', () => {
    expect(spellingSkeleton('ñingui')).not.toBe(spellingSkeleton('ningui'));
    expect(spellingSkeleton('Ñi')).toBe('ñi');
  });

  it('ignores capitals and accents like normalizar()', () => {
    expect(spellingSkeleton('Akó')).toBe(spellingSkeleton('ako'));
  });
});

describe('distinguishingRules', () => {
  it('names the alternation that separates the forms', () => {
    expect(distinguishingRules(['nʉnka', 'nunka'])).toEqual(['u / ʉ']);
    expect(distinguishingRules(['dugwa', 'dugua'])).toEqual(['w / u']);
    expect(distinguishingRules(['shkandzina', 'shkanyina'])).toEqual(['ndzina / nyina']);
    expect(distinguishingRules(['naya', 'naia'])).toEqual(['y / i']);
  });

  it('there can be several at once', () => {
    expect(distinguishingRules(['bʉgui', 'bugwi', 'bugui'])).toEqual(['u / ʉ', 'w / u']);
  });
});

describe('atDistanceOne', () => {
  it('one letter changed, extra or missing', () => {
    expect(atDistanceOne('kunkushina', 'kunkujshina')).toBe(true);
    expect(atDistanceOne('pastoores', 'pastores')).toBe(true);
    expect(atDistanceOne('ñingui', 'ningui')).toBe(true);
  });

  it('equal ones or ones with two differences do not count', () => {
    expect(atDistanceOne('nʉnka', 'nʉnka')).toBe(false);
    expect(atDistanceOne('urraga', 'urragamba')).toBe(false);
    expect(atDistanceOne('abisha', 'apeshi')).toBe(false);
  });
});
