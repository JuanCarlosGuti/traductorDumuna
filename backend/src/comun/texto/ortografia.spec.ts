import { corregirOrtografiaDamana, normalizarDamanaEscrito } from './ortografia';

const U_DIERESIS = String.fromCharCode(0x00fc);
const U_MAYUS_DIERESIS = String.fromCharCode(0x00dc);
const DIERESIS_COMBINANTE = String.fromCharCode(0x0308);

describe('corregirOrtografiaDamana (ü → ʉ)', () => {
  it('converts precomposed ü into ʉ', () => {
    expect(corregirOrtografiaDamana(`bug${U_DIERESIS}i`)).toBe('bugʉi');
  });

  it('converts capital Ü into Ʉ', () => {
    expect(corregirOrtografiaDamana(`${U_MAYUS_DIERESIS}nkua`)).toBe('Ʉnkua');
  });

  it('converts the decomposed form u + combining diaeresis', () => {
    expect(corregirOrtografiaDamana(`bug${'u' + DIERESIS_COMBINANTE}i`)).toBe('bugʉi');
  });

  it('does NOT touch plain u or ñ', () => {
    expect(corregirOrtografiaDamana('nunka ñingui')).toBe('nunka ñingui');
  });

  it('leaves intact the ʉ that was already right', () => {
    expect(corregirOrtografiaDamana('kʉnʉnka')).toBe('kʉnʉnka');
  });

  it('keeps typographic quotes', () => {
    expect(corregirOrtografiaDamana('‘shke’ta’')).toBe('‘shke’ta’');
  });
});

describe('normalizarDamanaEscrito (ü and u+ → ʉ, protecting Spanish words with ü)', () => {
  it('converts u+ into ʉ and U+ into Ʉ', () => {
    expect(normalizarDamanaEscrito('ku+nʉnka U+nkua')).toBe('kʉnʉnka Ʉnkua');
  });

  it('converts ü into ʉ like the CSV importer', () => {
    expect(normalizarDamanaEscrito(`bug${U_DIERESIS}i`)).toBe('bugʉi');
  });

  it('protects Spanish words with ü (vergüenza, pingüino, bilingüe)', () => {
    expect(normalizarDamanaEscrito('vergüenza pingüino bilingüe')).toBe(
      'vergüenza pingüino bilingüe',
    );
  });

  it('protects Spanish even when mixed with Damana using the ü workaround', () => {
    expect(normalizarDamanaEscrito(`bug${U_DIERESIS}i pingüino`)).toBe('bugʉi pingüino');
  });

  it('respects ñ as a full letter', () => {
    expect(normalizarDamanaEscrito('ñingu+i')).toBe('ñingʉi');
  });

  it('does not touch the + sign when it does not follow a u', () => {
    expect(normalizarDamanaEscrito('a+b')).toBe('a+b');
  });
});
