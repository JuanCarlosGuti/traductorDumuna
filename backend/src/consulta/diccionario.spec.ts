import { Idioma } from './consulta.enums';
import {
  alternativasEspanol,
  candidatosSingular,
  IndiceDiccionario,
  MAX_POSIBLES_POR_PALABRA,
} from './diccionario';
import { VocabularioDto } from './dto/consulta.dto';

const entrada = (
  id: number,
  espanol: string,
  damana: string,
  categoria = 'Otros',
): VocabularioDto => ({ id, espanol, damana, categoria, notas: null, fuente: 'dic' });

const VOCABULARIO: VocabularioDto[] = [
  entrada(1, 'Madre', 'Abu', 'Personas y familia'),
  entrada(2, 'mamá', 'Abu', 'Personas y familia'),
  entrada(3, 'Casa', 'Urraga', 'Casa / objetos / herramientas'),
  entrada(4, 'Cocinar', 'Dugua', 'Verbos'),
  entrada(5, 'Cocinando', 'Duzhi', 'Verbos'),
  entrada(6, 'Flor', 'Shoma', 'Plantas / árboles / frutos'),
  entrada(7, 'Año', 'Kʉgui', 'Tiempo / días / clima'),
  entrada(8, 'Tengo frío', 'Se namsi', 'Sentimientos / estados'),
  entrada(9, 'Cocinera (ave)', 'Abi', 'Animales'),
  entrada(10, 'Igual, lo mismo', 'Anzhengwi', 'Adjetivos'),
  entrada(11, 'Verb: Hacer', 'Awa', 'Verbos'),
  entrada(12, 'Agua', 'Dzira', 'Naturaleza / geografía'),
  entrada(13, 'En', 'Mba', 'Otros'),
  entrada(14, 'Feliz', 'Zen zhiguana', 'Sentimientos / estados'),
  entrada(15, 'Ese o esa', 'Mema', 'Conectores / determinantes'),
  entrada(16, 'No quiero', 'Nandunun', 'Sentimientos / estados'),
  entrada(17, 'No tengo', 'Nʉjkʉnanun', 'Verbos'),
];

describe('alternativasEspanol', () => {
  it('quita paréntesis y prefijos tipo «Verb:» y separa por comas', () => {
    expect(alternativasEspanol('Cocinera (ave)')).toEqual(['Cocinera']);
    expect(alternativasEspanol('Verb: Hacer')).toEqual(['Hacer']);
    expect(alternativasEspanol('Igual, lo mismo')).toEqual(['Igual', 'lo mismo']);
    expect(alternativasEspanol('Sí/akʉñí')).toEqual(['Sí', 'akʉñí']);
    expect(alternativasEspanol('Ese o esa')).toEqual(['Ese', 'esa']);
    expect(alternativasEspanol('Conocer o ver')).toEqual(['Conocer', 'ver']);
    expect(alternativasEspanol('Madre del agua y peces')).toEqual(['Madre del agua y peces']);
  });
});

describe('candidatosSingular', () => {
  it('flores → flor y flore; casas → casa; mes → (nada: demasiado corta)', () => {
    expect(candidatosSingular('flores')).toEqual(['flor', 'flore']);
    expect(candidatosSingular('casas')).toEqual(['casa']);
    expect(candidatosSingular('mes')).toEqual([]);
  });
});

describe('IndiceDiccionario (español → damana)', () => {
  const indice = new IndiceDiccionario(VOCABULARIO);
  const buscar = (texto: string) => indice.buscar(texto, Idioma.espanol);

  it('resuelve mamá, cocina y casa para «mi mamá cocina en la casa»', () => {
    const r = buscar('mi mamá cocina en la casa');
    const mama = r.filter((a) => a.palabra === 'mamá');
    expect(mama.map((a) => a.coincidencia)).toEqual(['exacta']);
    expect(mama[0].damana).toBe('Abu');
    const cocina = r.find((a) => a.palabra === 'cocina')!;
    expect(cocina.coincidencia).toBe('posible'); // cocin-ar / cocin-ando
    expect(['Dugua', 'Duzhi']).toContain(cocina.damana);
    expect(r.find((a) => a.palabra === 'casa')).toMatchObject({
      damana: 'Urraga',
      coincidencia: 'exacta',
    });
    // «en» es palabra gramatical pero tiene entrada exacta: se incluye
    expect(r.find((a) => a.palabra === 'en')).toMatchObject({ damana: 'Mba' });
  });

  it('exacta antes que sin tildes: «mama» sin tilde cae en sin_tildes', () => {
    expect(buscar('mama')[0]).toMatchObject({ damana: 'Abu', coincidencia: 'sin_tildes' });
    expect(buscar('MAMÁ')[0]).toMatchObject({ damana: 'Abu', coincidencia: 'exacta' });
  });

  it('singular: «flores» encuentra Flor', () => {
    expect(buscar('flores')).toEqual([
      expect.objectContaining({ palabra: 'flores', damana: 'Shoma', coincidencia: 'singular' }),
    ]);
  });

  it('devuelve todas las acepciones por prefijo, hasta el tope por palabra (cocina → cocinar, cocinando, cocinera)', () => {
    const r = buscar('cocina');
    expect(r.map((a) => a.damana)).toEqual(expect.arrayContaining(['Dugua', 'Duzhi']));
    expect(r.length).toBeLessThanOrEqual(MAX_POSIBLES_POR_PALABRA);
    expect(r.every((a) => a.coincidencia === 'posible')).toBe(true);
  });

  it('frases del diccionario cuando todas sus palabras están en el texto', () => {
    const r = buscar('hoy tengo frío');
    expect(r).toContainEqual(
      expect.objectContaining({ damana: 'Se namsi', coincidencia: 'frase' }),
    );
    expect(buscar('tengo hambre').some((a) => a.damana === 'Se namsi')).toBe(false);
  });

  it('respeta ñ ≠ n: «año» encuentra Kʉgui (con ʉ) y «ano» no', () => {
    expect(buscar('año')[0]).toMatchObject({ damana: 'Kʉgui', coincidencia: 'exacta' });
    expect(buscar('ano')).toEqual([]);
  });

  it('las stopwords sin entrada no se aproximan por prefijo', () => {
    expect(buscar('las')).toEqual([]);
  });

  it('«Ese o esa» se parte por la «o»: «Esa» encuentra Mema aunque sea palabra gramatical', () => {
    expect(buscar('Esa mujer')).toContainEqual(
      expect.objectContaining({ palabra: 'Esa', damana: 'Mema', coincidencia: 'exacta' }),
    );
  });

  it('las entradas negativas («No tengo», con ʉ) solo entran cuando la frase trae el «no»', () => {
    expect(buscar('no tengo agua')).toContainEqual(
      expect.objectContaining({ palabra: 'No tengo', damana: 'Nʉjkʉnanun', coincidencia: 'frase' }),
    );
    // Afirmativa: la forma negada NO debe aparecer (antes salía como «frase»
    // porque «no» se descartaba como stopword).
    expect(buscar('tengo agua').map((a) => a.damana)).not.toContain('Nʉjkʉnanun');
    // Otra negación distinta de «no» tampoco la activa.
    expect(buscar('nunca quiero').map((a) => a.damana)).not.toContain('Nandunun');
  });
});

describe('IndiceDiccionario (sinónimos coloquiales del español)', () => {
  // Como el vocabulario real: registra «Madre», no «mamá».
  const indice = new IndiceDiccionario([
    entrada(1, 'Madre', 'Abu', 'Personas y familia'),
    entrada(2, 'Padre', 'Ade', 'Personas y familia'),
    entrada(3, 'Mi hermana menor', 'Ranzhibusi', 'Personas y familia'),
    entrada(4, 'Hermana menor', 'Busi', 'Personas y familia'),
  ]);
  const buscar = (texto: string) => indice.buscar(texto, Idioma.espanol);

  it('mamá → Madre (Abu) marcado como sinónimo; papi → Padre', () => {
    expect(buscar('mi mamá cocina')).toContainEqual(
      expect.objectContaining({ palabra: 'mamá', damana: 'Abu', coincidencia: 'sinonimo' }),
    );
    expect(buscar('papi')).toEqual([expect.objectContaining({ damana: 'Ade', coincidencia: 'sinonimo' })]);
  });

  it('el sinónimo puede ser una entrada de varias palabras (hermanita → hermana menor)', () => {
    expect(buscar('hermanita')).toEqual([expect.objectContaining({ damana: 'Busi', coincidencia: 'sinonimo' })]);
  });

  it('las frases reconocidas muestran el texto completo de la entrada', () => {
    const frase = buscar('mi hermana menor llegó').find((a) => a.coincidencia === 'frase');
    expect(frase).toMatchObject({ palabra: 'Mi hermana menor', damana: 'Ranzhibusi' });
  });
});

describe('IndiceDiccionario (damana → español)', () => {
  const indice = new IndiceDiccionario(VOCABULARIO);

  it('coincidencia exacta normalizada con ʉ intacta; u ≠ ʉ', () => {
    const r = indice.buscar('Kʉgui', Idioma.damana);
    expect(r).toEqual([expect.objectContaining({ espanol: 'Año', coincidencia: 'exacta' })]);
    expect(indice.buscar('Kugui', Idioma.damana)).toEqual([]);
  });

  it('frase damana de varias palabras (zen zhiguana) solo cuando están todas', () => {
    expect(indice.buscar('zen zhiguana nukurra', Idioma.damana)).toContainEqual(
      expect.objectContaining({ espanol: 'Feliz', coincidencia: 'frase' }),
    );
    expect(indice.buscar('zen', Idioma.damana)).toEqual([]);
  });

  it('por prefijo marca «posible»', () => {
    expect(indice.buscar('Urragamba', Idioma.damana)).toEqual([
      expect.objectContaining({ espanol: 'Casa', coincidencia: 'posible' }),
    ]);
  });
});
