import { tokenizarDamana } from './tokenizador';

describe('tokenizarDamana', () => {
  it('splits on spaces and normalizes each token', () => {
    const tokens = tokenizarDamana('Jehová Kunkujshina naingontka');
    expect(tokens.map((t) => t.normalizada)).toEqual([
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
    const tokens = tokenizarDamana('¿Masheshishka nanu?');
    expect(tokens.map((t) => t.original)).toEqual(['Masheshishka', 'nanu']);
  });

  it('numbers are left out', () => {
    const tokens = tokenizarDamana('Génesis 1 y 2');
    expect(tokens.map((t) => t.normalizada)).toEqual(['genesis', 'y']);
  });

  it('keeps internal apostrophes and trims edge ones', () => {
    const tokens = tokenizarDamana("shke'ta 'awa'");
    expect(tokens.map((t) => t.original)).toEqual(["shke'ta", 'awa']);
  });

  it('keeps ʉ in tokens (case with ʉ)', () => {
    const tokens = tokenizarDamana('nʉnka kʉnʉnka');
    expect(tokens.map((t) => t.normalizada)).toEqual(['nʉnka', 'kʉnʉnka']);
  });

  it('keeps ñ in tokens (case with ñ)', () => {
    const tokens = tokenizarDamana('Ñingui kʉñingui');
    expect(tokens.map((t) => t.normalizada)).toEqual(['ñingui', 'kʉñingui']);
  });

  it('assigns consecutive positions even with line breaks and commas', () => {
    const tokens = tokenizarDamana('naka kʉñingui gontka,\nñingui tua ukurra');
    expect(tokens.map((t) => t.posicion)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('returns empty for text without letters', () => {
    expect(tokenizarDamana('  ¿? 123 …  ')).toEqual([]);
  });
});
