import { fixDamanaSpelling, normalizeWrittenDamana } from './ortografia';

const U_DIAERESIS = String.fromCharCode(0x00fc);
const UPPER_U_DIAERESIS = String.fromCharCode(0x00dc);
const COMBINING_DIAERESIS = String.fromCharCode(0x0308);

describe('fixDamanaSpelling (ü → ʉ)', () => {
  it('converts precomposed ü into ʉ', () => {
    expect(fixDamanaSpelling(`bug${U_DIAERESIS}i`)).toBe('bugʉi');
  });

  it('converts capital Ü into Ʉ', () => {
    expect(fixDamanaSpelling(`${UPPER_U_DIAERESIS}nkua`)).toBe('Ʉnkua');
  });

  it('converts the decomposed form u + combining diaeresis', () => {
    expect(fixDamanaSpelling(`bug${'u' + COMBINING_DIAERESIS}i`)).toBe('bugʉi');
  });

  it('does NOT touch plain u or ñ', () => {
    expect(fixDamanaSpelling('nunka ñingui')).toBe('nunka ñingui');
  });

  it('leaves intact the ʉ that was already right', () => {
    expect(fixDamanaSpelling('kʉnʉnka')).toBe('kʉnʉnka');
  });

  it('keeps typographic quotes', () => {
    expect(fixDamanaSpelling('‘shke’ta’')).toBe('‘shke’ta’');
  });
});

describe('normalizeWrittenDamana (ü and u+ → ʉ, protecting Spanish words with ü)', () => {
  it('converts u+ into ʉ and U+ into Ʉ', () => {
    expect(normalizeWrittenDamana('ku+nʉnka U+nkua')).toBe('kʉnʉnka Ʉnkua');
  });

  it('converts ü into ʉ like the CSV importer', () => {
    expect(normalizeWrittenDamana(`bug${U_DIAERESIS}i`)).toBe('bugʉi');
  });

  it('protects Spanish words with ü (vergüenza, pingüino, bilingüe)', () => {
    expect(normalizeWrittenDamana('vergüenza pingüino bilingüe')).toBe(
      'vergüenza pingüino bilingüe',
    );
  });

  it('protects Spanish even when mixed with Damana using the ü workaround', () => {
    expect(normalizeWrittenDamana(`bug${U_DIAERESIS}i pingüino`)).toBe('bugʉi pingüino');
  });

  it('respects ñ as a full letter', () => {
    expect(normalizeWrittenDamana('ñingu+i')).toBe('ñingʉi');
  });

  it('does not touch the + sign when it does not follow a u', () => {
    expect(normalizeWrittenDamana('a+b')).toBe('a+b');
  });
});
