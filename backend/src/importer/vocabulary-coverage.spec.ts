import { VocabularyCoverage } from './vocabulary-coverage';

describe('VocabularyCoverage', () => {
  const coverage = new VocabularyCoverage([
    { spanish: 'agua', damana: 'nʉnka' },
    { spanish: 'Año', damana: 'Kʉgui' },
    { spanish: 'Igual, lo mismo', damana: 'Anzhengwi' },
    { spanish: 'Ese o esa', damana: 'Mema' },
    { spanish: 'Territorio (tierra)', damana: 'Kangʉma' },
    { spanish: 'Flor', damana: 'Shoma' },
    { spanish: 'Hola', damana: 'Zungui' },
    { spanish: 'Sal', damana: 'Nʉngu' },
  ]);

  it('covers the same word regardless of capitals and accents', () => {
    expect(coverage.coversSpanish('AGUA')).toBe(true);
    expect(coverage.coversSpanish('año')).toBe(true);
    expect(coverage.coversSpanish('hola')).toBe(true);
  });

  it('ñ ≠ n: «ano» is not covered even though «año» is', () => {
    expect(coverage.coversSpanish('ano')).toBe(false);
  });

  it('covers via the alternatives on the Spanish side: commas, «o» and parentheses', () => {
    expect(coverage.coversSpanish('lo mismo')).toBe(true);
    expect(coverage.coversSpanish('esa')).toBe(true);
    expect(coverage.coversSpanish('tierra')).toBe(true);
    expect(coverage.coversSpanish('territorio')).toBe(true);
    // and also when the pending item carries the parenthesis
    expect(coverage.coversSpanish('sal (de cocina)')).toBe(true);
  });

  it('covers the plural of a single word (flores → flor) but does not make up phrases', () => {
    expect(coverage.coversSpanish('flores')).toBe(true);
    expect(coverage.coversSpanish('aguas')).toBe(true);
    expect(coverage.coversSpanish('flor de agua')).toBe(false);
  });

  it('does not cover what is not there', () => {
    expect(coverage.coversSpanish('vecina')).toBe(false);
    expect(coverage.coversSpanish('')).toBe(false);
  });

  it('in Damana it compares the normalized form and respects ʉ ≠ u', () => {
    expect(coverage.coversDamana('Nʉnka')).toBe(true);
    expect(coverage.coversDamana('nunka')).toBe(false);
    expect(coverage.coversDamana('kʉgui')).toBe(true);
    expect(coverage.covers('Nʉngu', 'damana')).toBe(true);
    expect(coverage.covers('sal', 'spanish')).toBe(true);
  });
});
