import {
  detectDoubtfulEntries,
  detectLookalikes,
  detectPolysemy,
  detectSynonyms,
  detectEndings,
  detectVariants,
  LexicalEntry,
  SeenForm,
  LOOKALIKE_KIND,
  TokenCorpus,
} from './dudas';

const form = (f: string, frequency = 0, meanings: string[] = []): SeenForm => ({
  forma: f,
  frecuencia: frequency,
  significados: meanings,
});

const NATIVE_SPEAKERS = 'nativas 2026-10';
const entry = (
  spanish: string,
  damana: string,
  notes: string | null = null,
  source = 'diccionario wiwa',
): LexicalEntry => ({ espanol: spanish, damana, categoria: null, notas: notes, fuente: source });

describe('detectVariants (same word, several spellings)', () => {
  const groups = detectVariants([
    form('nʉnka', 275),
    form('nunka', 2),
    form('dugwa', 0, ['Cocínelo']),
    form('dugua', 5, ['Cocinar']),
    form('terruandzina', 40),
    form('terruanyina', 1),
    form('ñingui', 30),
    form('ningui', 0),
    form('naka', 211),
    form('mʉ', 9),
    form('mu', 3),
  ]);

  it('groups by alternation and sorts by usage, most frequent form first', () => {
    expect(groups.map((g) => g.formas.map((f) => f.forma))).toEqual([
      ['nʉnka', 'nunka'],
      ['terruandzina', 'terruanyina'],
      ['dugua', 'dugwa'],
    ]);
    expect(groups.map((g) => g.tipo)).toEqual(['u / ʉ', 'ndzina / nyina', 'w / u']);
    expect(groups[0].total).toBe(277);
  });

  it('never merges ñ with n, nor proposes words shorter than 4 letters', () => {
    const all = groups.flatMap((g) => g.formas.map((f) => f.forma));
    expect(all).not.toContain('ñingui');
    expect(all).not.toContain('ningui');
    expect(all).not.toContain('mʉ');
  });
});

describe('detectLookalikes (one letter of difference and the same meaning)', () => {
  it('proposes the pair only if they share a meaning', () => {
    const groups = detectLookalikes([
      form('kunkushina', 0, ['Dios']),
      form('kunkujshina', 118, ['jehova', 'para dios']),
      form('abisha', 0, ['Calentar']),
      form('abishi', 0, ['Hiérvalo']),
      // the first letter changes: person prefix, not spelling
      form('anzhʉngʉma', 0, ['su hijo']),
      form('ranzhʉngʉma', 0, ['Mi hijo']),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].tipo).toBe(LOOKALIKE_KIND);
    expect(groups[0].formas.map((f) => f.forma)).toEqual(['kunkujshina', 'kunkushina']);
  });
});

describe('detectSynonyms (one Spanish word, several in Damana)', () => {
  const groups = detectSynonyms([
    entry('Grande', 'Aikuia'),
    entry('Grande', 'Alkwega'),
    entry('Día', 'Dzuia'),
    entry('Día', 'Dzwia'),
    entry('Igual, lo mismo', 'Anzhengwi'),
    entry('igual', 'zhʉntshijki', null, NATIVE_SPEAKERS),
    entry('Año', 'Kʉgui'),
  ]);

  it('groups by each Spanish alternative', () => {
    expect(groups.map((g) => [g.espanol, g.opciones.map((o) => o.damana)])).toEqual([
      ['Grande', ['Aikuia', 'Alkwega']],
      ['Igual', ['Anzhengwi', 'zhʉntshijki']],
    ]);
  });

  it('leaves out what is just another spelling (Dzuia / Dzwia goes on the spelling sheet)', () => {
    expect(groups.some((g) => g.espanol === 'Día')).toBe(false);
  });
});

describe('detectPolysemy (one Damana form, several meanings)', () => {
  const groups = detectPolysemy([
    entry('Familia', 'Kawa'),
    entry('Amigo', 'Kawa'),
    entry('Córtelo', 'Ako'),
    entry('lo cortó', 'Akó'),
    entry('Año', 'Kʉgui'),
    entry('años', 'kʉgui', null, NATIVE_SPEAKERS),
    entry('Agua', 'Dzira'),
  ]);

  it('flags the groups told apart only by the accent and puts them first', () => {
    expect(groups.map((g) => [g.clave, g.soloTilde])).toEqual([
      ['ako', true],
      ['kawa', false],
      ['kʉgui', false],
    ]);
    expect(groups[0].sentidos.map((s) => s.damana)).toEqual(['Ako', 'Akó']);
  });

  it('a word with a single meaning does not go in', () => {
    expect(groups.some((g) => g.clave === 'dzira')).toBe(false);
  });
});

describe('detectDoubtfulEntries', () => {
  const doubtful = detectDoubtfulEntries([
    entry('pedazo', 'unguzi', 'en damana no hay palabra para pastoores pero se puede traducir como hombres', NATIVE_SPEAKERS),
    entry('pastores', 'pastordzina', 'en el ejemplo en damana lo que dices NABINZHE : quiere decir es de nosotro', NATIVE_SPEAKERS),
    entry('nuestros', 'nabinzhe', 'nabinzhe: es de nosotros', NATIVE_SPEAKERS),
    entry('tan', 'tan', 'no hay forma para traducirlo', NATIVE_SPEAKERS),
    entry('quería', 'nandunanka ,andunanka', 'decir como,yo queria o el queria', NATIVE_SPEAKERS),
    entry('Verb: Hacer', 'Awa'),
    entry('Agua', 'Dzira', '115 Palabras'),
    entry('año', 'kʉgui', null, NATIVE_SPEAKERS),
    entry('Hoy otra vez estamos juntos qué bonito.', 'Iwa ingui nʉnzhu nukurra, zukuega nʉnka.', 'Vocabulario para las reuniones'),
  ]);
  const de = (spanish: string) => doubtful.find((d) => d.entrada.espanol === spanish);

  it('detects the note shifted to another row and says which neighbour it seems to belong to', () => {
    expect(de('pedazo')!.motivos).toEqual(['sin_forma', 'nota_de_otra_palabra']);
    expect(de('pedazo')!.pista).toContain('pastores');
    expect(de('pastores')!.motivos).toEqual(['nota_de_otra_palabra']);
    expect(de('pastores')!.pista).toContain('nuestros = nabinzhe');
  });

  it('a note that does talk about its own word only needs confirming', () => {
    expect(de('nuestros')).toMatchObject({ motivos: ['nota_por_confirmar'], pista: '' });
  });

  it('same as the Spanish, no form, several forms in one cell and unclear Spanish', () => {
    expect(de('tan')!.motivos).toEqual(['igual_que_espanol', 'sin_forma']);
    expect(de('quería')!.motivos).toEqual(['varias_formas', 'nota_por_confirmar']);
    expect(de('Verb: Hacer')!.motivos).toEqual(['espanol_poco_claro']);
  });

  it('what is clear is not listed (nor the dictionary category notes)', () => {
    expect(de('Agua')).toBeUndefined();
    expect(de('año')).toBeUndefined();
    // a sentence's comma is punctuation, not two forms in one cell
    expect(de('Hoy otra vez estamos juntos qué bonito.')).toBeUndefined();
    expect(doubtful).toHaveLength(6);
  });
});

describe('detectEndings', () => {
  const tokens = new Map<string, TokenCorpus>([
    ['urraga', { frecuencia: 50 }],
    ['urragamba', { frecuencia: 15, ejemplo: { damana: 'urragamba nuka', espanol: 'está en la casa' } }],
    ['kawamba', { frecuencia: 3 }],
    ['terruamba', { frecuencia: 2 }],
    ['kʉnsimba', { frecuencia: 1 }],
    ['urragaka', { frecuencia: 11 }],
    ['urraganzhe', { frecuencia: 2 }],
    ['kawanzhe', { frecuencia: 4 }],
    ['terruanzhe', { frecuencia: 1 }],
    ['kunsinzhe', { frecuencia: 7 }], // with u: it is NOT the root kʉnsi
  ]);
  const endings = detectEndings(
    [
      { raiz: 'urraga', significado: 'Casa' },
      { raiz: 'kawa', significado: 'Familia' },
      { raiz: 'terrua', significado: 'Hombre' },
      { raiz: 'kʉnsi', significado: 'Perro' },
      { raiz: 'abu', significado: 'Madre' }, // too short to be a reliable root
    ],
    tokens,
    new Map([
      ['nzhe', 'regla anotada: posesivo'],
      ['mba', 'en el diccionario: En'],
    ]),
    { minimoRaices: 3 },
  );

  it('counts in how many base words each ending appears and discards the rare ones', () => {
    expect(endings.map((t) => [t.terminacion, t.raices])).toEqual([
      ['mba', 4],
      ['nzhe', 3],
    ]);
  });

  it('respects ʉ ≠ u when recognizing the root', () => {
    const nzhe = endings.find((t) => t.terminacion === 'nzhe')!;
    expect(nzhe.ejemplos.map((e) => e.raiz)).not.toContain('kʉnsi');
  });

  it('brings the most frequent examples with their sentence and what we already know', () => {
    const mba = endings[0];
    expect(mba.yaSabemos).toBe('en el diccionario: En');
    expect(mba.ejemplos[0]).toMatchObject({
      raiz: 'urraga',
      significado: 'Casa',
      forma: 'urragamba',
      ejemplo: { espanol: 'está en la casa' },
    });
    expect(mba.ejemplos).toHaveLength(3);
  });

  it('prefers the example whose sentence mentions the meaning of the base word', () => {
    const [ga] = detectEndings(
      [
        { raiz: 'anzhʉn', significado: 'sueño' },
        { raiz: 'ijkʉna', significado: 'Ellos' },
        { raiz: 'terrua', significado: 'Hombre' },
      ],
      new Map<string, TokenCorpus>([
        ['anzhʉnga', { frecuencia: 60, ejemplo: { damana: 'Ima bʉgui anzhʉnga', espanol: 'Esto es muy importante' } }],
        ['ijkʉnaga', { frecuencia: 9, ejemplo: { damana: 'Ijkʉnaga gʉgantshijso', espanol: 'Ellos dijeron que sí' } }],
        ['terruaga', { frecuencia: 2 }],
      ]),
      new Map(),
      { minimoRaices: 3 },
    );
    expect(ga.terminacion).toBe('ga');
    expect(ga.ejemplos.map((e) => [e.forma, e.encaja])).toEqual([
      ['ijkʉnaga', true],
      ['anzhʉnga', false],
      ['terruaga', false],
    ]);
  });
});
