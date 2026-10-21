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

  it('cubre la misma palabra sin importar mayúsculas ni tildes', () => {
    expect(cobertura.cubreEspanol('AGUA')).toBe(true);
    expect(cobertura.cubreEspanol('año')).toBe(true);
    expect(cobertura.cubreEspanol('hola')).toBe(true);
  });

  it('ñ ≠ n: «ano» no está cubierta aunque «año» sí', () => {
    expect(cobertura.cubreEspanol('ano')).toBe(false);
  });

  it('cubre por las alternativas del lado español: comas, «o» y paréntesis', () => {
    expect(cobertura.cubreEspanol('lo mismo')).toBe(true);
    expect(cobertura.cubreEspanol('esa')).toBe(true);
    expect(cobertura.cubreEspanol('tierra')).toBe(true);
    expect(cobertura.cubreEspanol('territorio')).toBe(true);
    // y también cuando la pendiente trae el paréntesis
    expect(cobertura.cubreEspanol('sal (de cocina)')).toBe(true);
  });

  it('cubre el plural de una palabra suelta (flores → flor) pero no inventa frases', () => {
    expect(cobertura.cubreEspanol('flores')).toBe(true);
    expect(cobertura.cubreEspanol('aguas')).toBe(true);
    expect(cobertura.cubreEspanol('flor de agua')).toBe(false);
  });

  it('no cubre lo que no está', () => {
    expect(cobertura.cubreEspanol('vecina')).toBe(false);
    expect(cobertura.cubreEspanol('')).toBe(false);
  });

  it('en damana compara la forma normalizada y respeta ʉ ≠ u', () => {
    expect(cobertura.cubreDamana('Nʉnka')).toBe(true);
    expect(cobertura.cubreDamana('nunka')).toBe(false);
    expect(cobertura.cubreDamana('kʉgui')).toBe(true);
    expect(cobertura.cubre('Nʉngu', 'damana')).toBe(true);
    expect(cobertura.cubre('sal', 'espanol')).toBe(true);
  });
});
