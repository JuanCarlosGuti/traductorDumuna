import {
  buscarOcurrencias,
  extraerFragmento,
  marcarOcurrencias,
} from './concordancia';

describe('buscarOcurrencias', () => {
  it('finds regardless of capitals and accents: jehova ↔ Jehová', () => {
    const texto = 'Jehová Kunkujshina naingontka, jehovága no';
    const oc = buscarOcurrencias(texto, 'jehova');
    expect(oc).toHaveLength(1);
    expect(oc[0]).toEqual({ inicio: 0, fin: 6, palabra: 'Jehová' });
  });

  it('keeps ʉ: nʉnka does not match nunka or vice versa', () => {
    const texto = 'nʉnka nunka nʉnka';
    expect(buscarOcurrencias(texto, 'nʉnka')).toHaveLength(2);
    expect(buscarOcurrencias(texto, 'nunka')).toHaveLength(1);
  });

  it('keeps ñ: ñingui does not match ningui', () => {
    const texto = 'Ñingui tua ningui';
    const oc = buscarOcurrencias(texto, 'ñingui');
    expect(oc).toHaveLength(1);
    expect(oc[0].palabra).toBe('Ñingui');
  });

  it('matches whole words, not substrings', () => {
    const oc = buscarOcurrencias('kʉnʉnka nʉnka', 'nʉnka');
    expect(oc).toHaveLength(1);
    expect(oc[0].inicio).toBe(8);
  });

  it('trims edge apostrophes but keeps internal ones', () => {
    const oc = buscarOcurrencias("'shke'ta' awa", "shke'ta");
    expect(oc).toHaveLength(1);
    expect(oc[0].palabra).toBe("shke'ta");
    expect(oc[0].inicio).toBe(1);
  });

  it('indexes survive ¿? signs and numbers', () => {
    const texto = '¿Masheshishka 42 nanu?';
    const oc = buscarOcurrencias(texto, 'nanu');
    expect(texto.slice(oc[0].inicio, oc[0].fin)).toBe('nanu');
  });
});

describe('marcarOcurrencias', () => {
  it('marks all occurrences of several words (with ʉ and ñ)', () => {
    const texto = 'nʉnka gontka ñingui nʉnka';
    const ocurrencias = [
      ...buscarOcurrencias(texto, 'nʉnka'),
      ...buscarOcurrencias(texto, 'ñingui'),
    ];
    expect(marcarOcurrencias(texto, ocurrencias)).toBe(
      '<mark>nʉnka</mark> gontka <mark>ñingui</mark> <mark>nʉnka</mark>',
    );
  });

  it('with no occurrences returns the text escaped and with spaces collapsed', () => {
    expect(marcarOcurrencias('a <b>\ncosa', [])).toBe('a &lt;b&gt; cosa');
  });

  it('ignores overlapping occurrences', () => {
    const texto = 'nʉnka';
    const oc = buscarOcurrencias(texto, 'nʉnka');
    expect(marcarOcurrencias(texto, [...oc, ...oc])).toBe('<mark>nʉnka</mark>');
  });
});

describe('extraerFragmento', () => {
  it('wraps the word in <mark> without trimming short texts', () => {
    const texto = 'naka kʉñingui gontka';
    const [oc] = buscarOcurrencias(texto, 'kʉñingui');
    expect(extraerFragmento(texto, oc)).toBe('naka <mark>kʉñingui</mark> gontka');
  });

  it('cuts at a word boundary at ±radio and marks with …', () => {
    const relleno = 'palabra '.repeat(40); // 320 characters
    const texto = `${relleno}nʉnka ${relleno}`.trim();
    const [oc] = buscarOcurrencias(texto, 'nʉnka');
    const frag = extraerFragmento(texto, oc, 120);

    expect(frag.startsWith('…')).toBe(true);
    expect(frag.endsWith('…')).toBe(true);
    expect(frag).toContain('<mark>nʉnka</mark>');
    // never cuts a word in half: only whole words remain
    const soloTexto = frag.replace(/…|<\/?mark>/g, '');
    for (const p of soloTexto.split(' ').filter(Boolean)) {
      expect(['palabra', 'nʉnka']).toContain(p);
    }
  });

  it('collapses context line breaks to spaces', () => {
    const texto = 'primera línea\nsegunda ñingui línea\ntercera';
    const [oc] = buscarOcurrencias(texto, 'ñingui');
    expect(extraerFragmento(texto, oc)).toBe(
      'primera línea segunda <mark>ñingui</mark> línea tercera',
    );
  });

  it('escapes corpus HTML outside and inside the <mark>', () => {
    const texto = 'a <b> nʉnka & c';
    const [oc] = buscarOcurrencias(texto, 'nʉnka');
    expect(extraerFragmento(texto, oc)).toBe(
      'a &lt;b&gt; <mark>nʉnka</mark> &amp; c',
    );
  });
});
