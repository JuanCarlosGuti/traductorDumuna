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

describe('detectarVariantes (misma palabra, varias escrituras)', () => {
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

  it('agrupa por alternancia y ordena por uso, la forma más frecuente primero', () => {
    expect(grupos.map((g) => g.formas.map((f) => f.forma))).toEqual([
      ['nʉnka', 'nunka'],
      ['terruandzina', 'terruanyina'],
      ['dugua', 'dugwa'],
    ]);
    expect(grupos.map((g) => g.tipo)).toEqual(['u / ʉ', 'ndzina / nyina', 'w / u']);
    expect(grupos[0].total).toBe(277);
  });

  it('nunca junta ñ con n, ni propone palabras de menos de 4 letras', () => {
    const todas = grupos.flatMap((g) => g.formas.map((f) => f.forma));
    expect(todas).not.toContain('ñingui');
    expect(todas).not.toContain('ningui');
    expect(todas).not.toContain('mʉ');
  });
});

describe('detectarParecidas (una letra de diferencia y el mismo significado)', () => {
  it('propone el par solo si comparten significado', () => {
    const grupos = detectarParecidas([
      forma('kunkushina', 0, ['Dios']),
      forma('kunkujshina', 118, ['jehova', 'para dios']),
      forma('abisha', 0, ['Calentar']),
      forma('abishi', 0, ['Hiérvalo']),
      // cambia la primera letra: prefijo de persona, no escritura
      forma('anzhʉngʉma', 0, ['su hijo']),
      forma('ranzhʉngʉma', 0, ['Mi hijo']),
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].tipo).toBe(TIPO_PARECIDAS);
    expect(grupos[0].formas.map((f) => f.forma)).toEqual(['kunkujshina', 'kunkushina']);
  });
});

describe('detectarSinonimos (una palabra española, varias en damana)', () => {
  const grupos = detectarSinonimos([
    entrada('Grande', 'Aikuia'),
    entrada('Grande', 'Alkwega'),
    entrada('Día', 'Dzuia'),
    entrada('Día', 'Dzwia'),
    entrada('Igual, lo mismo', 'Anzhengwi'),
    entrada('igual', 'zhʉntshijki', null, NATIVAS),
    entrada('Año', 'Kʉgui'),
  ]);

  it('agrupa por cada alternativa del español', () => {
    expect(grupos.map((g) => [g.espanol, g.opciones.map((o) => o.damana)])).toEqual([
      ['Grande', ['Aikuia', 'Alkwega']],
      ['Igual', ['Anzhengwi', 'zhʉntshijki']],
    ]);
  });

  it('deja fuera lo que es solo otra escritura (Dzuia / Dzwia va en la hoja de escritura)', () => {
    expect(grupos.some((g) => g.espanol === 'Día')).toBe(false);
  });
});

describe('detectarPolisemia (una forma damana, varios significados)', () => {
  const grupos = detectarPolisemia([
    entrada('Familia', 'Kawa'),
    entrada('Amigo', 'Kawa'),
    entrada('Córtelo', 'Ako'),
    entrada('lo cortó', 'Akó'),
    entrada('Año', 'Kʉgui'),
    entrada('años', 'kʉgui', null, NATIVAS),
    entrada('Agua', 'Dzira'),
  ]);

  it('marca los grupos que solo se distinguen por la tilde y los pone primero', () => {
    expect(grupos.map((g) => [g.clave, g.soloTilde])).toEqual([
      ['ako', true],
      ['kawa', false],
      ['kʉgui', false],
    ]);
    expect(grupos[0].sentidos.map((s) => s.damana)).toEqual(['Ako', 'Akó']);
  });

  it('una palabra con un solo significado no entra', () => {
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

  it('detecta la nota corrida de fila y dice de cuál vecina parece ser', () => {
    expect(de('pedazo')!.motivos).toEqual(['sin_forma', 'nota_de_otra_palabra']);
    expect(de('pedazo')!.pista).toContain('pastores');
    expect(de('pastores')!.motivos).toEqual(['nota_de_otra_palabra']);
    expect(de('pastores')!.pista).toContain('nuestros = nabinzhe');
  });

  it('una nota que sí habla de su palabra solo queda por confirmar', () => {
    expect(de('nuestros')).toMatchObject({ motivos: ['nota_por_confirmar'], pista: '' });
  });

  it('igual que el español, sin forma, varias formas en una casilla y español poco claro', () => {
    expect(de('tan')!.motivos).toEqual(['igual_que_espanol', 'sin_forma']);
    expect(de('quería')!.motivos).toEqual(['varias_formas', 'nota_por_confirmar']);
    expect(de('Verb: Hacer')!.motivos).toEqual(['espanol_poco_claro']);
  });

  it('lo que está claro no se lista (ni las notas de categoría del diccionario)', () => {
    expect(de('Agua')).toBeUndefined();
    expect(de('año')).toBeUndefined();
    // la coma de una oración es puntuación, no dos formas en una casilla
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
    ['kunsinzhe', { frecuencia: 7 }], // con u: NO es la raíz kʉnsi
  ]);
  const terminaciones = detectarTerminaciones(
    [
      { raiz: 'urraga', significado: 'Casa' },
      { raiz: 'kawa', significado: 'Familia' },
      { raiz: 'terrua', significado: 'Hombre' },
      { raiz: 'kʉnsi', significado: 'Perro' },
      { raiz: 'abu', significado: 'Madre' }, // demasiado corta para ser raíz fiable
    ],
    tokens,
    new Map([
      ['nzhe', 'regla anotada: posesivo'],
      ['mba', 'en el diccionario: En'],
    ]),
    { minimoRaices: 3 },
  );

  it('cuenta en cuántas palabras base aparece cada terminación y descarta las raras', () => {
    expect(terminaciones.map((t) => [t.terminacion, t.raices])).toEqual([
      ['mba', 4],
      ['nzhe', 3],
    ]);
  });

  it('respeta ʉ ≠ u al reconocer la raíz', () => {
    const nzhe = terminaciones.find((t) => t.terminacion === 'nzhe')!;
    expect(nzhe.ejemplos.map((e) => e.raiz)).not.toContain('kʉnsi');
  });

  it('trae los ejemplos más frecuentes con su oración y lo que ya sabemos', () => {
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

  it('prefiere el ejemplo cuya oración menciona el significado de la palabra base', () => {
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
