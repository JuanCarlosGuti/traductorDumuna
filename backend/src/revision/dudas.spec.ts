import {
  detectarEntradasDudosas,
  detectarParecidas,
  detectarPolisemia,
  detectarSinonimos,
  detectarTerminaciones,
  detectarVariantes,
  EntradaLexica,
  FormaVista,
  TIPO_PARECIDAS,
  TokenCorpus,
} from './dudas';

const forma = (f: string, frecuencia = 0, significados: string[] = []): FormaVista => ({
  forma: f,
  frecuencia,
  significados,
});

const NATIVAS = 'nativas 2026-10';
const entrada = (
  espanol: string,
  damana: string,
  notas: string | null = null,
  fuente = 'diccionario wiwa',
): EntradaLexica => ({ espanol, damana, categoria: null, notas, fuente });

describe('detectarVariantes (same word, several spellings)', () => {
  const grupos = detectarVariantes([
    forma('nʉnka', 275),
    forma('nunka', 2),
    forma('dugwa', 0, ['Cocínelo']),
    forma('dugua', 5, ['Cocinar']),
    forma('terruandzina', 40),
    forma('terruanyina', 1),
    forma('ñingui', 30),
    forma('ningui', 0),
    forma('naka', 211),
    forma('mʉ', 9),
    forma('mu', 3),
  ]);

  it('groups by alternation and sorts by usage, most frequent form first', () => {
    expect(grupos.map((g) => g.formas.map((f) => f.forma))).toEqual([
      ['nʉnka', 'nunka'],
      ['terruandzina', 'terruanyina'],
      ['dugua', 'dugwa'],
    ]);
    expect(grupos.map((g) => g.tipo)).toEqual(['u / ʉ', 'ndzina / nyina', 'w / u']);
    expect(grupos[0].total).toBe(277);
  });

  it('never merges ñ with n, nor proposes words shorter than 4 letters', () => {
    const todas = grupos.flatMap((g) => g.formas.map((f) => f.forma));
    expect(todas).not.toContain('ñingui');
    expect(todas).not.toContain('ningui');
    expect(todas).not.toContain('mʉ');
  });
});

describe('detectarParecidas (one letter of difference and the same meaning)', () => {
  it('proposes the pair only if they share a meaning', () => {
    const grupos = detectarParecidas([
      forma('kunkushina', 0, ['Dios']),
      forma('kunkujshina', 118, ['jehova', 'para dios']),
      forma('abisha', 0, ['Calentar']),
      forma('abishi', 0, ['Hiérvalo']),
      // the first letter changes: person prefix, not spelling
      forma('anzhʉngʉma', 0, ['su hijo']),
      forma('ranzhʉngʉma', 0, ['Mi hijo']),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].tipo).toBe(TIPO_PARECIDAS);
    expect(grupos[0].formas.map((f) => f.forma)).toEqual(['kunkujshina', 'kunkushina']);
  });
});

describe('detectarSinonimos (one Spanish word, several in Damana)', () => {
  const grupos = detectarSinonimos([
    entrada('Grande', 'Aikuia'),
    entrada('Grande', 'Alkwega'),
    entrada('Día', 'Dzuia'),
    entrada('Día', 'Dzwia'),
    entrada('Igual, lo mismo', 'Anzhengwi'),
    entrada('igual', 'zhʉntshijki', null, NATIVAS),
    entrada('Año', 'Kʉgui'),
  ]);

  it('groups by each Spanish alternative', () => {
    expect(grupos.map((g) => [g.espanol, g.opciones.map((o) => o.damana)])).toEqual([
      ['Grande', ['Aikuia', 'Alkwega']],
      ['Igual', ['Anzhengwi', 'zhʉntshijki']],
    ]);
  });

  it('leaves out what is just another spelling (Dzuia / Dzwia goes on the spelling sheet)', () => {
    expect(grupos.some((g) => g.espanol === 'Día')).toBe(false);
  });
});

describe('detectarPolisemia (one Damana form, several meanings)', () => {
  const grupos = detectarPolisemia([
    entrada('Familia', 'Kawa'),
    entrada('Amigo', 'Kawa'),
    entrada('Córtelo', 'Ako'),
    entrada('lo cortó', 'Akó'),
    entrada('Año', 'Kʉgui'),
    entrada('años', 'kʉgui', null, NATIVAS),
    entrada('Agua', 'Dzira'),
  ]);

  it('flags the groups told apart only by the accent and puts them first', () => {
    expect(grupos.map((g) => [g.clave, g.soloTilde])).toEqual([
      ['ako', true],
      ['kawa', false],
      ['kʉgui', false],
    ]);
    expect(grupos[0].sentidos.map((s) => s.damana)).toEqual(['Ako', 'Akó']);
  });

  it('a word with a single meaning does not go in', () => {
    expect(grupos.some((g) => g.clave === 'dzira')).toBe(false);
  });
});

describe('detectarEntradasDudosas', () => {
  const dudosas = detectarEntradasDudosas([
    entrada('pedazo', 'unguzi', 'en damana no hay palabra para pastoores pero se puede traducir como hombres', NATIVAS),
    entrada('pastores', 'pastordzina', 'en el ejemplo en damana lo que dices NABINZHE : quiere decir es de nosotro', NATIVAS),
    entrada('nuestros', 'nabinzhe', 'nabinzhe: es de nosotros', NATIVAS),
    entrada('tan', 'tan', 'no hay forma para traducirlo', NATIVAS),
    entrada('quería', 'nandunanka ,andunanka', 'decir como,yo queria o el queria', NATIVAS),
    entrada('Verb: Hacer', 'Awa'),
    entrada('Agua', 'Dzira', '115 Palabras'),
    entrada('año', 'kʉgui', null, NATIVAS),
    entrada('Hoy otra vez estamos juntos qué bonito.', 'Iwa ingui nʉnzhu nukurra, zukuega nʉnka.', 'Vocabulario para las reuniones'),
  ]);
  const de = (espanol: string) => dudosas.find((d) => d.entrada.espanol === espanol);

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
    expect(dudosas).toHaveLength(6);
  });
});

describe('detectarTerminaciones', () => {
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
  const terminaciones = detectarTerminaciones(
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
    expect(terminaciones.map((t) => [t.terminacion, t.raices])).toEqual([
      ['mba', 4],
      ['nzhe', 3],
    ]);
  });

  it('respects ʉ ≠ u when recognizing the root', () => {
    const nzhe = terminaciones.find((t) => t.terminacion === 'nzhe')!;
    expect(nzhe.ejemplos.map((e) => e.raiz)).not.toContain('kʉnsi');
  });

  it('brings the most frequent examples with their sentence and what we already know', () => {
    const mba = terminaciones[0];
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
    const [ga] = detectarTerminaciones(
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
