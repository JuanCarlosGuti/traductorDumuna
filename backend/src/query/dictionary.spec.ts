import { Language } from './query.enums';
import {
  spanishAlternatives,
  singularCandidates,
  DictionaryIndex,
  MAX_POSSIBLE_PER_WORD,
} from './dictionary';
import { VocabularyDto } from './dto/query.dto';

const entry = (
  id: number,
  spanish: string,
  damana: string,
  category = 'Otros',
): VocabularyDto => ({ id, spanish: spanish, damana, category: category, notes: null, source: 'dic' });

const VOCABULARY: VocabularyDto[] = [
  entry(1, 'Madre', 'Abu', 'Personas y familia'),
  entry(2, 'mamá', 'Abu', 'Personas y familia'),
  entry(3, 'Casa', 'Urraga', 'Casa / objetos / herramientas'),
  entry(4, 'Cocinar', 'Dugua', 'Verbos'),
  entry(5, 'Cocinando', 'Duzhi', 'Verbos'),
  entry(6, 'Flor', 'Shoma', 'Plantas / árboles / frutos'),
  entry(7, 'Año', 'Kʉgui', 'Tiempo / días / clima'),
  entry(8, 'Tengo frío', 'Se namsi', 'Sentimientos / estados'),
  entry(9, 'Cocinera (ave)', 'Abi', 'Animales'),
  entry(10, 'Igual, lo mismo', 'Anzhengwi', 'Adjetivos'),
  entry(11, 'Verb: Hacer', 'Awa', 'Verbos'),
  entry(12, 'Agua', 'Dzira', 'Naturaleza / geografía'),
  entry(13, 'En', 'Mba', 'Otros'),
  entry(14, 'Feliz', 'Zen zhiguana', 'Sentimientos / estados'),
  entry(15, 'Ese o esa', 'Mema', 'Conectores / determinantes'),
  entry(16, 'No quiero', 'Nandunun', 'Sentimientos / estados'),
  entry(17, 'No tengo', 'Nʉjkʉnanun', 'Verbos'),
];

describe('spanishAlternatives', () => {
  it('removes parentheses and prefixes like «Verb:» and splits on commas', () => {
    expect(spanishAlternatives('Cocinera (ave)')).toEqual(['Cocinera']);
    expect(spanishAlternatives('Verb: Hacer')).toEqual(['Hacer']);
    expect(spanishAlternatives('Igual, lo mismo')).toEqual(['Igual', 'lo mismo']);
    expect(spanishAlternatives('Sí/akʉñí')).toEqual(['Sí', 'akʉñí']);
    expect(spanishAlternatives('Ese o esa')).toEqual(['Ese', 'esa']);
    expect(spanishAlternatives('Conocer o ver')).toEqual(['Conocer', 'ver']);
    expect(spanishAlternatives('Madre del agua y peces')).toEqual(['Madre del agua y peces']);
  });
});

describe('singularCandidates', () => {
  it('flores → flor and flore; casas → casa; mes → (nothing: too short)', () => {
    expect(singularCandidates('flores')).toEqual(['flor', 'flore']);
    expect(singularCandidates('casas')).toEqual(['casa']);
    expect(singularCandidates('mes')).toEqual([]);
  });
});

describe('DictionaryIndex (Spanish → Damana)', () => {
  const index = new DictionaryIndex(VOCABULARY);
  const search = (text: string) => index.search(text, Language.espanol);

  it('resolves mamá, cocina and casa for «mi mamá cocina en la casa»', () => {
    const r = search('mi mamá cocina en la casa');
    const mama = r.filter((a) => a.word === 'mamá');
    expect(mama.map((a) => a.match)).toEqual(['exacta']);
    expect(mama[0].damana).toBe('Abu');
    const cocina = r.find((a) => a.word === 'cocina')!;
    expect(cocina.match).toBe('posible'); // cocin-ar / cocin-ando
    expect(['Dugua', 'Duzhi']).toContain(cocina.damana);
    expect(r.find((a) => a.word === 'casa')).toMatchObject({
      damana: 'Urraga',
      match: 'exacta',
    });
    // «en» is a function word but has an exact entry: it is included
    expect(r.find((a) => a.word === 'en')).toMatchObject({ damana: 'Mba' });
  });

  it('exact before no-accents: «mama» without accent falls under sin_tildes', () => {
    expect(search('mama')[0]).toMatchObject({ damana: 'Abu', match: 'sin_tildes' });
    expect(search('MAMÁ')[0]).toMatchObject({ damana: 'Abu', match: 'exacta' });
  });

  it('singular: «flores» finds Flor', () => {
    expect(search('flores')).toEqual([
      expect.objectContaining({ word: 'flores', damana: 'Shoma', match: 'singular' }),
    ]);
  });

  it('returns all senses by prefix, up to the per-word cap (cocina → cocinar, cocinando, cocinera)', () => {
    const r = search('cocina');
    expect(r.map((a) => a.damana)).toEqual(expect.arrayContaining(['Dugua', 'Duzhi']));
    expect(r.length).toBeLessThanOrEqual(MAX_POSSIBLE_PER_WORD);
    expect(r.every((a) => a.match === 'posible')).toBe(true);
  });

  it('dictionary phrases when all their words are in the text', () => {
    const r = search('hoy tengo frío');
    expect(r).toContainEqual(
      expect.objectContaining({ damana: 'Se namsi', match: 'frase' }),
    );
    expect(search('tengo hambre').some((a) => a.damana === 'Se namsi')).toBe(false);
  });

  it('respects ñ ≠ n: «año» finds Kʉgui (with ʉ) and «ano» does not', () => {
    expect(search('año')[0]).toMatchObject({ damana: 'Kʉgui', match: 'exacta' });
    expect(search('ano')).toEqual([]);
  });

  it('stopwords without an entry are not approximated by prefix', () => {
    expect(search('las')).toEqual([]);
  });

  it('«Ese o esa» is split on the «o»: «Esa» finds Mema even though it is a function word', () => {
    expect(search('Esa mujer')).toContainEqual(
      expect.objectContaining({ word: 'Esa', damana: 'Mema', match: 'exacta' }),
    );
  });

  it('negative entries («No tengo», with ʉ) only come in when the sentence carries the «no»', () => {
    expect(search('no tengo agua')).toContainEqual(
      expect.objectContaining({ word: 'No tengo', damana: 'Nʉjkʉnanun', match: 'frase' }),
    );
    // Affirmative: the negated form must NOT appear (it used to show up as «frase»
    // because «no» was discarded as a stopword).
    expect(search('tengo agua').map((a) => a.damana)).not.toContain('Nʉjkʉnanun');
    // Another negation other than «no» does not trigger it either.
    expect(search('nunca quiero').map((a) => a.damana)).not.toContain('Nandunun');
  });
});

describe('DictionaryIndex (colloquial Spanish synonyms)', () => {
  // Like the real vocabulary: it records «Madre», not «mamá».
  const index = new DictionaryIndex([
    entry(1, 'Madre', 'Abu', 'Personas y familia'),
    entry(2, 'Padre', 'Ade', 'Personas y familia'),
    entry(3, 'Mi hermana menor', 'Ranzhibusi', 'Personas y familia'),
    entry(4, 'Hermana menor', 'Busi', 'Personas y familia'),
  ]);
  const search = (text: string) => index.search(text, Language.espanol);

  it('mamá → Madre (Abu) marked as synonym; papi → Padre', () => {
    expect(search('mi mamá cocina')).toContainEqual(
      expect.objectContaining({ word: 'mamá', damana: 'Abu', match: 'sinonimo' }),
    );
    expect(search('papi')).toEqual([expect.objectContaining({ damana: 'Ade', match: 'sinonimo' })]);
  });

  it('the synonym can be a multi-word entry (hermanita → hermana menor)', () => {
    expect(search('hermanita')).toEqual([expect.objectContaining({ damana: 'Busi', match: 'sinonimo' })]);
  });

  it('recognized phrases show the full text of the entry', () => {
    const phrase = search('mi hermana menor llegó').find((a) => a.match === 'frase');
    expect(phrase).toMatchObject({ word: 'Mi hermana menor', damana: 'Ranzhibusi' });
  });
});

describe('DictionaryIndex (Damana → Spanish)', () => {
  const index = new DictionaryIndex(VOCABULARY);

  it('exact normalized match with ʉ intact; u ≠ ʉ', () => {
    const r = index.search('Kʉgui', Language.damana);
    expect(r).toEqual([expect.objectContaining({ spanish: 'Año', match: 'exacta' })]);
    expect(index.search('Kugui', Language.damana)).toEqual([]);
  });

  it('multi-word Damana phrase (zen zhiguana) only when all words are present', () => {
    expect(index.search('zen zhiguana nukurra', Language.damana)).toContainEqual(
      expect.objectContaining({ spanish: 'Feliz', match: 'frase' }),
    );
    expect(index.search('zen', Language.damana)).toEqual([]);
  });

  it('by prefix it marks «posible»', () => {
    expect(index.search('Urragamba', Language.damana)).toEqual([
      expect.objectContaining({ spanish: 'Casa', match: 'posible' }),
    ]);
  });
});
