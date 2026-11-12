import { tokenizeDamana } from './tokenizer';

describe('tokenizeDamana', () => {
  it('splits on spaces and normalizes each token', () => {
    const tokens = tokenizeDamana('Jehová Kunkujshina naingontka');
    expect(tokens.map((t) => t.normalized)).toEqual([
      'jehova',
      'kunkujshina',
      'naingontka',
    ]);
    expect(tokens.map((t) => t.original)).toEqual([
      'Jehová',
      'Kunkujshina',
      'naingontka',
    ]);
  });

  it('¿? signs produce no tokens and do not stick to words', () => {
    const tokens = tokenizeDamana('¿Masheshishka nanu?');
    expect(tokens.map((t) => t.original)).toEqual(['Masheshishka', 'nanu']);
  });

  it('numbers are left out', () => {
    const tokens = tokenizeDamana('Génesis 1 y 2');
    expect(tokens.map((t) => t.normalized)).toEqual(['genesis', 'y']);
  });

  it('keeps internal apostrophes and trims edge ones', () => {
    const tokens = tokenizeDamana("shke'ta 'awa'");
    expect(tokens.map((t) => t.original)).toEqual(["shke'ta", 'awa']);
  });

  it('keeps ʉ in tokens (case with ʉ)', () => {
    const tokens = tokenizeDamana('nʉnka kʉnʉnka');
    expect(tokens.map((t) => t.normalized)).toEqual(['nʉnka', 'kʉnʉnka']);
  });

  it('keeps ñ in tokens (case with ñ)', () => {
    const tokens = tokenizeDamana('Ñingui kʉñingui');
    expect(tokens.map((t) => t.normalized)).toEqual(['ñingui', 'kʉñingui']);
  });

  it('assigns consecutive positions even with line breaks and commas', () => {
    const tokens = tokenizeDamana('naka kʉñingui gontka,\nñingui tua ukurra');
    expect(tokens.map((t) => t.position)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('returns empty for text without letters', () => {
    expect(tokenizeDamana('  ¿? 123 …  ')).toEqual([]);
  });
});
