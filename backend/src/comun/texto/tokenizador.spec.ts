import { tokenizarDamana } from './tokenizador';

describe('tokenizarDamana', () => {
  it('separa por espacios y normaliza cada token', () => {
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

  it('los signos ¿? no generan tokens ni quedan pegados', () => {
    const tokens = tokenizarDamana('¿Masheshishka nanu?');
    expect(tokens.map((t) => t.original)).toEqual(['Masheshishka', 'nanu']);
  });

  it('los números quedan fuera', () => {
    const tokens = tokenizarDamana('Génesis 1 y 2');
    expect(tokens.map((t) => t.normalizada)).toEqual(['genesis', 'y']);
  });

  it('conserva apóstrofes internos y recorta los de borde', () => {
    const tokens = tokenizarDamana("shke'ta 'awa'");
    expect(tokens.map((t) => t.original)).toEqual(["shke'ta", 'awa']);
  });

  it('conserva ʉ en tokens (caso con ʉ)', () => {
    const tokens = tokenizarDamana('nʉnka kʉnʉnka');
    expect(tokens.map((t) => t.normalizada)).toEqual(['nʉnka', 'kʉnʉnka']);
  });

  it('conserva ñ en tokens (caso con ñ)', () => {
    const tokens = tokenizarDamana('Ñingui kʉñingui');
    expect(tokens.map((t) => t.normalizada)).toEqual(['ñingui', 'kʉñingui']);
  });

  it('asigna posiciones consecutivas incluso con saltos de línea y comas', () => {
    const tokens = tokenizarDamana('naka kʉñingui gontka,\nñingui tua ukurra');
    expect(tokens.map((t) => t.posicion)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('devuelve vacío para texto sin letras', () => {
    expect(tokenizarDamana('  ¿? 123 …  ')).toEqual([]);
  });
});
