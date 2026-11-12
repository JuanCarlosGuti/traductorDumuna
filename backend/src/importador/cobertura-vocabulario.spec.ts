import { CoberturaVocabulario } from './cobertura-vocabulario';

describe('CoberturaVocabulario', () => {
  const cobertura = new CoberturaVocabulario([
    { espanol: 'agua', damana: 'nʉnka' },
    { espanol: 'Año', damana: 'Kʉgui' },
    { espanol: 'Igual, lo mismo', damana: 'Anzhengwi' },
    { espanol: 'Ese o esa', damana: 'Mema' },
    { espanol: 'Territorio (tierra)', damana: 'Kangʉma' },
    { espanol: 'Flor', damana: 'Shoma' },
    { espanol: 'Hola', damana: 'Zungui' },
    { espanol: 'Sal', damana: 'Nʉngu' },
  ]);

  it('covers the same word regardless of capitals and accents', () => {
    expect(cobertura.cubreEspanol('AGUA')).toBe(true);
    expect(cobertura.cubreEspanol('año')).toBe(true);
    expect(cobertura.cubreEspanol('hola')).toBe(true);
  });

  it('ñ ≠ n: «ano» is not covered even though «año» is', () => {
    expect(cobertura.cubreEspanol('ano')).toBe(false);
  });

  it('covers via the alternatives on the Spanish side: commas, «o» and parentheses', () => {
    expect(cobertura.cubreEspanol('lo mismo')).toBe(true);
    expect(cobertura.cubreEspanol('esa')).toBe(true);
    expect(cobertura.cubreEspanol('tierra')).toBe(true);
    expect(cobertura.cubreEspanol('territorio')).toBe(true);
    // and also when the pending item carries the parenthesis
    expect(cobertura.cubreEspanol('sal (de cocina)')).toBe(true);
  });

  it('covers the plural of a single word (flores → flor) but does not make up phrases', () => {
    expect(cobertura.cubreEspanol('flores')).toBe(true);
    expect(cobertura.cubreEspanol('aguas')).toBe(true);
    expect(cobertura.cubreEspanol('flor de agua')).toBe(false);
  });

  it('does not cover what is not there', () => {
    expect(cobertura.cubreEspanol('vecina')).toBe(false);
    expect(cobertura.cubreEspanol('')).toBe(false);
  });

  it('in Damana it compares the normalized form and respects ʉ ≠ u', () => {
    expect(cobertura.cubreDamana('Nʉnka')).toBe(true);
    expect(cobertura.cubreDamana('nunka')).toBe(false);
    expect(cobertura.cubreDamana('kʉgui')).toBe(true);
    expect(cobertura.cubre('Nʉngu', 'damana')).toBe(true);
    expect(cobertura.cubre('sal', 'espanol')).toBe(true);
  });
});
