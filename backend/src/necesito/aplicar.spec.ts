import { buildLines, planChanges } from './aplicar';

const glossary = [
  { espanol: 'agua', damana: 'nʉnka' },
  { espanol: 'otra vez', damana: 'ñingui' },
];

describe('planificar (reverse command)', () => {
  it('adds the new rows', () => {
    const r = planChanges([{ espanol: 'pueblo', damana: 'gunamandzina' }], glossary);
    expect(r.agregadas).toEqual([{ espanol: 'pueblo', damana: 'gunamandzina' }]);
    expect(r.duplicadas).toEqual([]);
  });

  it('skips what is already in the glossary (case with ʉ)', () => {
    const r = planChanges([{ espanol: 'agua', damana: 'nʉnka' }], glossary);
    expect(r.agregadas).toEqual([]);
    expect(r.duplicadas).toHaveLength(1);
  });

  it('the comparison respects ʉ ≠ u and ñ ≠ n', () => {
    // 'nunka' is NOT 'nʉnka', so it is a new entry, not a duplicate
    const r = planChanges(
      [
        { espanol: 'agua', damana: 'nunka' },
        { espanol: 'otra vez', damana: 'ningui' },
      ],
      glossary,
    );
    expect(r.agregadas).toHaveLength(2);
    expect(r.duplicadas).toEqual([]);
  });

  it('ignores capitals, accents and spaces when comparing', () => {
    // Ʉ (U+0244) is the capital of ʉ (U+0289); it is built numerically
    // so as not to confuse it with Ʊ (U+028A), which is a different letter.
    const nunkaMayus = 'N' + String.fromCharCode(0x0244) + 'NKA';
    const r = planChanges([{ espanol: '  Água ', damana: nunkaMayus }], glossary);
    expect(r.duplicadas).toHaveLength(1);
    expect(r.agregadas).toEqual([]);
  });

  it('does not duplicate within the Excel itself', () => {
    const r = planChanges(
      [
        { espanol: 'pueblo', damana: 'gunamandzina' },
        { espanol: 'pueblo', damana: 'gunamandzina' },
      ],
      glossary,
    );
    expect(r.agregadas).toHaveLength(1);
    expect(r.duplicadas).toHaveLength(1);
  });

  it('fixes the Word ü to ʉ like the importer', () => {
    const withDiaeresis = 'bug' + String.fromCharCode(0x00fc) + 'i';
    const r = planChanges([{ espanol: 'arriba', damana: withDiaeresis }], glossary);
    expect(r.agregadas[0].damana).toBe('bugʉi');
  });

  it('the same Spanish word can have another Damana translation', () => {
    // real polysemy in the corpus: it must not be blocked by the Spanish side
    const r = planChanges([{ espanol: 'agua', damana: 'dzira' }], glossary);
    expect(r.agregadas).toEqual([{ espanol: 'agua', damana: 'dzira' }]);
  });
});

describe('buildLines', () => {
  const newItems = [
    { espanol: 'pueblo', damana: 'gunamandzina' },
    { espanol: 'casa', damana: 'ugunga' },
  ];

  it('uses CRLF when the existing CSV uses CRLF', () => {
    const current = 'espanol,damana,categoria,notas,fuente\r\nagua,nʉnka,,,dic\r\n';
    const text = buildLines(newItems, current);
    expect(text).toBe(
      'pueblo,gunamandzina,,,lista automatica\r\ncasa,ugunga,,,lista automatica\r\n',
    );
    expect(text.includes('\n\n')).toBe(false);
    // The full result must still have one row per line
    expect((current + text).trim().split(/\r\n/)).toHaveLength(4);
  });

  it('uses LF when the existing CSV uses LF', () => {
    const current = 'espanol,damana,categoria,notas,fuente\nagua,nʉnka,,,dic\n';
    expect(buildLines(newItems, current)).toBe(
      'pueblo,gunamandzina,,,lista automatica\ncasa,ugunga,,,lista automatica\n',
    );
  });

  it('adds the missing line break if the CSV does not end in a new line', () => {
    const current = 'espanol,damana,categoria,notas,fuente\r\nagua,nʉnka,,,dic';
    expect(buildLines(newItems, current).startsWith('\r\n')).toBe(true);
  });

  it('escapes commas and quotes in fields', () => {
    const text = buildLines(
      [{ espanol: 'casa, choza', damana: 'dijo "hola"' }],
      'a\r\n',
    );
    expect(text).toBe('"casa, choza","dijo ""hola""",,,lista automatica\r\n');
  });

  it('with no new rows it writes nothing', () => {
    expect(buildLines([], 'a\r\n')).toBe('');
  });
});
