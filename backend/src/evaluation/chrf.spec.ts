import { chrF, ngrams, prepareText } from './chrf';

describe('chrF (own implementation)', () => {
  it('prepares the text: NFC, lowercase, no spaces or punctuation', () => {
    expect(prepareText('Nʉnka  Shkua.')).toBe('nʉnkashkua');
    expect(prepareText('¿Nʉnka, shkua?')).toBe('nʉnkashkua');
  });

  it('counts character n-grams', () => {
    const g = ngrams('abab', 2);
    expect(g.get('ab')).toBe(2);
    expect(g.get('ba')).toBe(1);
  });

  it('identical text → 1; nothing in common → 0', () => {
    expect(chrF('nʉnka shkua', 'nʉnka shkua')).toBe(1);
    expect(chrF('xyz', 'abc')).toBe(0);
  });

  it('is insensitive to capitals and spaces, but not to letters', () => {
    expect(chrF('NʉNKA SHKUA', 'nʉnka shkua')).toBe(1);
    expect(chrF('nʉnka shkua', 'nʉnka shkwa')).toBeLessThan(1);
  });

  it('ʉ ≠ u: replacing ʉ with u lowers the score', () => {
    const withU = chrF('nunka shkua gontka', 'nʉnka shkua gontka');
    expect(withU).toBeLessThan(1);
    expect(withU).toBeGreaterThan(0.6); // but it is still similar
  });

  it('ñ ≠ n: ñingui and ningui are not equal', () => {
    expect(chrF('ningui', 'ñingui')).toBeLessThan(1);
  });

  it('a partial translation scores in between and recall weighs more (beta = 2)', () => {
    const shortText = chrF('nʉnka', 'nʉnka shkua gontka'); // precise but incomplete
    const longText = chrF('nʉnka shkua gontka ñingui tua', 'nʉnka shkua gontka'); // complete with extra
    expect(shortText).toBeGreaterThan(0);
    expect(shortText).toBeLessThan(1);
    expect(longText).toBeGreaterThan(shortText);
  });

  it('empties: both empty → 1, only one → 0', () => {
    expect(chrF('', '')).toBe(1);
    expect(chrF('', 'nʉnka')).toBe(0);
    expect(chrF('nʉnka', '')).toBe(0);
  });

  it('texts shorter than the maximum order are not penalized for lacking 6-grams', () => {
    expect(chrF('ra', 'ra')).toBe(1);
  });
});
