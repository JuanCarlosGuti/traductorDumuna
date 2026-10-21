import { chrF, ngramas, prepararTexto } from './chrf';

describe('chrF (implementación propia)', () => {
  it('prepara el texto: NFC, minúsculas, sin espacios ni puntuación', () => {
    expect(prepararTexto('Nʉnka  Shkua.')).toBe('nʉnkashkua');
    expect(prepararTexto('¿Nʉnka, shkua?')).toBe('nʉnkashkua');
  });

  it('cuenta n-gramas de caracteres', () => {
    const g = ngramas('abab', 2);
    expect(g.get('ab')).toBe(2);
    expect(g.get('ba')).toBe(1);
  });

  it('texto idéntico → 1; sin nada en común → 0', () => {
    expect(chrF('nʉnka shkua', 'nʉnka shkua')).toBe(1);
    expect(chrF('xyz', 'abc')).toBe(0);
  });

  it('es insensible a mayúsculas y espacios, pero no a las letras', () => {
    expect(chrF('NʉNKA SHKUA', 'nʉnka shkua')).toBe(1);
    expect(chrF('nʉnka shkua', 'nʉnka shkwa')).toBeLessThan(1);
  });

  it('ʉ ≠ u: cambiar la ʉ por u baja el puntaje', () => {
    const conU = chrF('nunka shkua gontka', 'nʉnka shkua gontka');
    expect(conU).toBeLessThan(1);
    expect(conU).toBeGreaterThan(0.6); // pero sigue siendo parecido
  });

  it('ñ ≠ n: ñingui y ningui no son iguales', () => {
    expect(chrF('ningui', 'ñingui')).toBeLessThan(1);
  });

  it('una traducción parcial puntúa entre medias y la cobertura pesa más (beta = 2)', () => {
    const corta = chrF('nʉnka', 'nʉnka shkua gontka'); // precisa pero incompleta
    const larga = chrF('nʉnka shkua gontka ñingui tua', 'nʉnka shkua gontka'); // completa con sobra
    expect(corta).toBeGreaterThan(0);
    expect(corta).toBeLessThan(1);
    expect(larga).toBeGreaterThan(corta);
  });

  it('vacíos: ambos vacíos → 1, uno solo → 0', () => {
    expect(chrF('', '')).toBe(1);
    expect(chrF('', 'nʉnka')).toBe(0);
    expect(chrF('nʉnka', '')).toBe(0);
  });

  it('textos más cortos que el orden máximo no se penalizan por falta de 6-gramas', () => {
    expect(chrF('ra', 'ra')).toBe(1);
  });
});
