import { corregirOrtografiaDamana, normalizarDamanaEscrito } from './ortografia';

const U_DIERESIS = String.fromCharCode(0x00fc);
const U_MAYUS_DIERESIS = String.fromCharCode(0x00dc);
const DIERESIS_COMBINANTE = String.fromCharCode(0x0308);

describe('corregirOrtografiaDamana (ü → ʉ)', () => {
  it('convierte ü precompuesta en ʉ', () => {
    expect(corregirOrtografiaDamana(`bug${U_DIERESIS}i`)).toBe('bugʉi');
  });

  it('convierte Ü mayúscula en Ʉ', () => {
    expect(corregirOrtografiaDamana(`${U_MAYUS_DIERESIS}nkua`)).toBe('Ʉnkua');
  });

  it('convierte la forma descompuesta u + diéresis combinante', () => {
    expect(corregirOrtografiaDamana(`bug${'u' + DIERESIS_COMBINANTE}i`)).toBe('bugʉi');
  });

  it('NO toca la u simple ni la ñ', () => {
    expect(corregirOrtografiaDamana('nunka ñingui')).toBe('nunka ñingui');
  });

  it('deja intacta la ʉ que ya venía bien', () => {
    expect(corregirOrtografiaDamana('kʉnʉnka')).toBe('kʉnʉnka');
  });

  it('conserva las comillas tipográficas', () => {
    expect(corregirOrtografiaDamana('‘shke’ta’')).toBe('‘shke’ta’');
  });
});

describe('normalizarDamanaEscrito (ü y u+ → ʉ, protegiendo el español con ü)', () => {
  it('convierte u+ en ʉ y U+ en Ʉ', () => {
    expect(normalizarDamanaEscrito('ku+nʉnka U+nkua')).toBe('kʉnʉnka Ʉnkua');
  });

  it('convierte ü en ʉ como el importador de CSV', () => {
    expect(normalizarDamanaEscrito(`bug${U_DIERESIS}i`)).toBe('bugʉi');
  });

  it('protege las palabras españolas con ü (vergüenza, pingüino, bilingüe)', () => {
    expect(normalizarDamanaEscrito('vergüenza pingüino bilingüe')).toBe(
      'vergüenza pingüino bilingüe',
    );
  });

  it('protege el español aunque vaya mezclado con damana con ü de apaño', () => {
    expect(normalizarDamanaEscrito(`bug${U_DIERESIS}i pingüino`)).toBe('bugʉi pingüino');
  });

  it('respeta la ñ como letra plena', () => {
    expect(normalizarDamanaEscrito('ñingu+i')).toBe('ñingʉi');
  });

  it('no toca el signo + cuando no sigue a una u', () => {
    expect(normalizarDamanaEscrito('a+b')).toBe('a+b');
  });
});
