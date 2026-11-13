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
} from './doubts';

const form = (f: string, frequency = 0, meanings: string[] = []): SeenForm => ({
  form: f,
  frequency: frequency,
  meanings: meanings,
});

const NATIVE_SPEAKERS = 'nativas 2026-10';
const entry = (
  spanish: string,
  damana: string,
  notes: string | null = null,
  source = 'diccionario wiwa',
): LexicalEntry => ({ spanish: spanish, damana, category: null, notes: notes, source: source });

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
    expect(groups.map((g) => g.forms.map((f) => f.form))).toEqual([
      ['nʉnka', 'nunka'],
      ['terruandzina', 'terruanyina'],
      ['dugua', 'dugwa'],
    ]);
    expect(groups.map((g) => g.type)).toEqual(['u / ʉ', 'ndzina / nyina', 'w / u']);
    expect(groups[0].total).toBe(277);
  });

  it('never merges ñ with n, nor proposes words shorter than 4 letters', () => {
    const all = groups.flatMap((g) => g.forms.map((f) => f.form));
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
    expect(groups[0].type).toBe(LOOKALIKE_KIND);
    expect(groups[0].forms.map((f) => f.form)).toEqual(['kunkujshina', 'kunkushina']);
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
    expect(groups.map((g) => [g.spanish, g.options.map((o) => o.damana)])).toEqual([
      ['Grande', ['Aikuia', 'Alkwega']],
      ['Igual', ['Anzhengwi', 'zhʉntshijki']],
    ]);
  });

  it('leaves out what is just another spelling (Dzuia / Dzwia goes on the spelling sheet)', () => {
    expect(groups.some((g) => g.spanish === 'Día')).toBe(false);
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
    expect(groups.map((g) => [g.key, g.accentOnly])).toEqual([
      ['ako', true],
      ['kawa', false],
      ['kʉgui', false],
    ]);
    expect(groups[0].senses.map((s) => s.damana)).toEqual(['Ako', 'Akó']);
  });

  it('a word with a single meaning does not go in', () => {
    expect(groups.some((g) => g.key === 'dzira')).toBe(false);
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
  const de = (spanish: string) => doubtful.find((d) => d.entry.spanish === spanish);

  it('detects the note shifted to another row and says which neighbour it seems to belong to', () => {
    expect(de('pedazo')!.reasons).toEqual(['no_form', 'note_from_other_word']);
    expect(de('pedazo')!.hint).toContain('pastores');
    expect(de('pastores')!.reasons).toEqual(['note_from_other_word']);
    expect(de('pastores')!.hint).toContain('nuestros = nabinzhe');
  });

  it('a note that does talk about its own word only needs confirming', () => {
    expect(de('nuestros')).toMatchObject({ reasons: ['note_to_confirm'], hint: '' });
  });

  it('same as the Spanish, no form, several forms in one cell and unclear Spanish', () => {
    expect(de('tan')!.reasons).toEqual(['same_as_spanish', 'no_form']);
    expect(de('quería')!.reasons).toEqual(['multiple_forms', 'note_to_confirm']);
    expect(de('Verb: Hacer')!.reasons).toEqual(['unclear_spanish']);
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
    ['urraga', { frequency: 50 }],
    ['urragamba', { frequency: 15, example: { damana: 'urragamba nuka', spanish: 'está en la casa' } }],
    ['kawamba', { frequency: 3 }],
    ['terruamba', { frequency: 2 }],
    ['kʉnsimba', { frequency: 1 }],
    ['urragaka', { frequency: 11 }],
    ['urraganzhe', { frequency: 2 }],
    ['kawanzhe', { frequency: 4 }],
    ['terruanzhe', { frequency: 1 }],
    ['kunsinzhe', { frequency: 7 }], // with u: it is NOT the root kʉnsi
  ]);
  const endings = detectEndings(
    [
      { root: 'urraga', meaning: 'Casa' },
      { root: 'kawa', meaning: 'Familia' },
      { root: 'terrua', meaning: 'Hombre' },
      { root: 'kʉnsi', meaning: 'Perro' },
      { root: 'abu', meaning: 'Madre' }, // too short to be a reliable root
    ],
    tokens,
    new Map([
      ['nzhe', 'regla anotada: posesivo'],
      ['mba', 'en el diccionario: En'],
    ]),
    { minRoots: 3 },
  );

  it('counts in how many base words each ending appears and discards the rare ones', () => {
    expect(endings.map((t) => [t.ending, t.roots])).toEqual([
      ['mba', 4],
      ['nzhe', 3],
    ]);
  });

  it('respects ʉ ≠ u when recognizing the root', () => {
    const nzhe = endings.find((t) => t.ending === 'nzhe')!;
    expect(nzhe.examples.map((e) => e.root)).not.toContain('kʉnsi');
  });

  it('brings the most frequent examples with their sentence and what we already know', () => {
    const mba = endings[0];
    expect(mba.alreadyKnown).toBe('en el diccionario: En');
    expect(mba.examples[0]).toMatchObject({
      root: 'urraga',
      meaning: 'Casa',
      form: 'urragamba',
      example: { spanish: 'está en la casa' },
    });
    expect(mba.examples).toHaveLength(3);
  });

  it('prefers the example whose sentence mentions the meaning of the base word', () => {
    const [ga] = detectEndings(
      [
        { root: 'anzhʉn', meaning: 'sueño' },
        { root: 'ijkʉna', meaning: 'Ellos' },
        { root: 'terrua', meaning: 'Hombre' },
      ],
      new Map<string, TokenCorpus>([
        ['anzhʉnga', { frequency: 60, example: { damana: 'Ima bʉgui anzhʉnga', spanish: 'Esto es muy importante' } }],
        ['ijkʉnaga', { frequency: 9, example: { damana: 'Ijkʉnaga gʉgantshijso', spanish: 'Ellos dijeron que sí' } }],
        ['terruaga', { frequency: 2 }],
      ]),
      new Map(),
      { minRoots: 3 },
    );
    expect(ga.ending).toBe('ga');
    expect(ga.examples.map((e) => [e.form, e.fits])).toEqual([
      ['ijkʉnaga', true],
      ['anzhʉnga', false],
      ['terruaga', false],
    ]);
  });
});
