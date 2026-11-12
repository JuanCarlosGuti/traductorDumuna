import { construirLineas, planificar } from './aplicar';

const glosario = [
  { espanol: 'agua', damana: 'nʉnka' },
  { espanol: 'otra vez', damana: 'ñingui' },
];

describe('planificar (reverse command)', () => {
  it('adds the new rows', () => {
    const r = planificar([{ espanol: 'pueblo', damana: 'gunamandzina' }], glosario);
    expect(r.agregadas).toEqual([{ espanol: 'pueblo', damana: 'gunamandzina' }]);
    expect(r.duplicadas).toEqual([]);
  });

  it('skips what is already in the glossary (case with ʉ)', () => {
    const r = planificar([{ espanol: 'agua', damana: 'nʉnka' }], glosario);
    expect(r.agregadas).toEqual([]);
    expect(r.duplicadas).toHaveLength(1);
  });

  it('the comparison respects ʉ ≠ u and ñ ≠ n', () => {
    // 'nunka' is NOT 'nʉnka', so it is a new entry, not a duplicate
    const r = planificar(
      [
        { espanol: 'agua', damana: 'nunka' },
        { espanol: 'otra vez', damana: 'ningui' },
      ],
      glosario,
    );
    expect(r.agregadas).toHaveLength(2);
    expect(r.duplicadas).toEqual([]);
  });

  it('ignores capitals, accents and spaces when comparing', () => {
    // Ʉ (U+0244) is the capital of ʉ (U+0289); it is built numerically
    // so as not to confuse it with Ʊ (U+028A), which is a different letter.
    const nunkaMayus = 'N' + String.fromCharCode(0x0244) + 'NKA';
    const r = planificar([{ espanol: '  Água ', damana: nunkaMayus }], glosario);
    expect(r.duplicadas).toHaveLength(1);
    expect(r.agregadas).toEqual([]);
  });

  it('does not duplicate within the Excel itself', () => {
    const r = planificar(
      [
        { espanol: 'pueblo', damana: 'gunamandzina' },
        { espanol: 'pueblo', damana: 'gunamandzina' },
      ],
      glosario,
    );
    expect(r.agregadas).toHaveLength(1);
    expect(r.duplicadas).toHaveLength(1);
  });

  it('fixes the Word ü to ʉ like the importer', () => {
    const conDieresis = 'bug' + String.fromCharCode(0x00fc) + 'i';
    const r = planificar([{ espanol: 'arriba', damana: conDieresis }], glosario);
    expect(r.agregadas[0].damana).toBe('bugʉi');
  });

  it('the same Spanish word can have another Damana translation', () => {
    // real polysemy in the corpus: it must not be blocked by the Spanish side
    const r = planificar([{ espanol: 'agua', damana: 'dzira' }], glosario);
    expect(r.agregadas).toEqual([{ espanol: 'agua', damana: 'dzira' }]);
  });
});

describe('construirLineas', () => {
  const nuevas = [
    { espanol: 'pueblo', damana: 'gunamandzina' },
    { espanol: 'casa', damana: 'ugunga' },
  ];

  it('uses CRLF when the existing CSV uses CRLF', () => {
    const actual = 'espanol,damana,categoria,notas,fuente\r\nagua,nʉnka,,,dic\r\n';
    const texto = construirLineas(nuevas, actual);
    expect(texto).toBe(
      'pueblo,gunamandzina,,,lista automatica\r\ncasa,ugunga,,,lista automatica\r\n',
    );
    expect(texto.includes('\n\n')).toBe(false);
    // The full result must still have one row per line
    expect((actual + texto).trim().split(/\r\n/)).toHaveLength(4);
  });

  it('uses LF when the existing CSV uses LF', () => {
    const actual = 'espanol,damana,categoria,notas,fuente\nagua,nʉnka,,,dic\n';
    expect(construirLineas(nuevas, actual)).toBe(
      'pueblo,gunamandzina,,,lista automatica\ncasa,ugunga,,,lista automatica\n',
    );
  });

  it('adds the missing line break if the CSV does not end in a new line', () => {
    const actual = 'espanol,damana,categoria,notas,fuente\r\nagua,nʉnka,,,dic';
    expect(construirLineas(nuevas, actual).startsWith('\r\n')).toBe(true);
  });

  it('escapes commas and quotes in fields', () => {
    const texto = construirLineas(
      [{ espanol: 'casa, choza', damana: 'dijo "hola"' }],
      'a\r\n',
    );
    expect(texto).toBe('"casa, choza","dijo ""hola""",,,lista automatica\r\n');
  });

  it('with no new rows it writes nothing', () => {
    expect(construirLineas([], 'a\r\n')).toBe('');
  });
});
