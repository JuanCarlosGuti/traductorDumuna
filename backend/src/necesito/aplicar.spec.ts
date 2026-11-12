import { construirLineas, planificar } from './aplicar';

const glosario = [
  { espanol: 'agua', damana: 'nʉnka' },
  { espanol: 'otra vez', damana: 'ñingui' },
];

describe('planificar (comando inverso)', () => {
  it('agrega las filas nuevas', () => {
    const r = planificar([{ espanol: 'pueblo', damana: 'gunamandzina' }], glosario);
    expect(r.agregadas).toEqual([{ espanol: 'pueblo', damana: 'gunamandzina' }]);
    expect(r.duplicadas).toEqual([]);
  });

  it('omite lo que ya está en el glosario (caso con ʉ)', () => {
    const r = planificar([{ espanol: 'agua', damana: 'nʉnka' }], glosario);
    expect(r.agregadas).toEqual([]);
    expect(r.duplicadas).toHaveLength(1);
  });

  it('la comparación respeta ʉ ≠ u y ñ ≠ n', () => {
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

  it('ignora mayúsculas, tildes y espacios al comparar', () => {
    // Ʉ (U+0244) is the capital of ʉ (U+0289); it is built numerically
    // so as not to confuse it with Ʊ (U+028A), which is a different letter.
    const nunkaMayus = 'N' + String.fromCharCode(0x0244) + 'NKA';
    const r = planificar([{ espanol: '  Água ', damana: nunkaMayus }], glosario);
    expect(r.duplicadas).toHaveLength(1);
    expect(r.agregadas).toEqual([]);
  });

  it('no duplica dentro del propio Excel', () => {
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

  it('corrige la ü de Word a ʉ igual que el importador', () => {
    const conDieresis = 'bug' + String.fromCharCode(0x00fc) + 'i';
    const r = planificar([{ espanol: 'arriba', damana: conDieresis }], glosario);
    expect(r.agregadas[0].damana).toBe('bugʉi');
  });

  it('una misma palabra española puede tener otra traducción damana', () => {
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

  it('usa CRLF cuando el CSV existente usa CRLF', () => {
    const actual = 'espanol,damana,categoria,notas,fuente\r\nagua,nʉnka,,,dic\r\n';
    const texto = construirLineas(nuevas, actual);
    expect(texto).toBe(
      'pueblo,gunamandzina,,,lista automatica\r\ncasa,ugunga,,,lista automatica\r\n',
    );
    expect(texto.includes('\n\n')).toBe(false);
    // The full result must still have one row per line
    expect((actual + texto).trim().split(/\r\n/)).toHaveLength(4);
  });

  it('usa LF cuando el CSV existente usa LF', () => {
    const actual = 'espanol,damana,categoria,notas,fuente\nagua,nʉnka,,,dic\n';
    expect(construirLineas(nuevas, actual)).toBe(
      'pueblo,gunamandzina,,,lista automatica\ncasa,ugunga,,,lista automatica\n',
    );
  });

  it('añade el salto que falta si el CSV no termina en nueva línea', () => {
    const actual = 'espanol,damana,categoria,notas,fuente\r\nagua,nʉnka,,,dic';
    expect(construirLineas(nuevas, actual).startsWith('\r\n')).toBe(true);
  });

  it('escapa comas y comillas de los campos', () => {
    const texto = construirLineas(
      [{ espanol: 'casa, choza', damana: 'dijo "hola"' }],
      'a\r\n',
    );
    expect(texto).toBe('"casa, choza","dijo ""hola""",,,lista automatica\r\n');
  });

  it('sin filas nuevas no escribe nada', () => {
    expect(construirLineas([], 'a\r\n')).toBe('');
  });
});
