import { corregirOrtografiaDamana } from './ortografia';

const PRECOMPUESTA = String.fromCharCode(0x00fc); // ü
const DESCOMPUESTA = 'u' + String.fromCharCode(0x0308); // u + ◌̈
const MAYUS_PRE = String.fromCharCode(0x00dc); // Ü

describe('corregirOrtografiaDamana', () => {
  it('convierte ü precompuesta en ʉ: bugüi → bugʉi', () => {
    expect(corregirOrtografiaDamana(`bug${PRECOMPUESTA}i`)).toBe('bugʉi');
  });

  it('convierte la forma descompuesta (u + diéresis combinante)', () => {
    expect(corregirOrtografiaDamana(`bug${DESCOMPUESTA}i`)).toBe('bugʉi');
  });

  it('convierte Ü mayúscula en Ʉ', () => {
    expect(corregirOrtografiaDamana(`${MAYUS_PRE}gui`)).toBe('Ʉgui');
  });

  it('NO toca la u simple (u ≠ ʉ, no se puede adivinar)', () => {
    expect(corregirOrtografiaDamana('nujkunananka ukurra')).toBe('nujkunananka ukurra');
  });

  it('NO toca ʉ, ñ ni tildes existentes', () => {
    expect(corregirOrtografiaDamana('nʉnka ñingui Jehovága')).toBe('nʉnka ñingui Jehovága');
  });

  it('NO toca las comillas tipográficas (son puntuación de citas)', () => {
    const texto = `‘Jehová nanguneka’`;
    expect(corregirOrtografiaDamana(texto)).toBe(texto);
  });
});
