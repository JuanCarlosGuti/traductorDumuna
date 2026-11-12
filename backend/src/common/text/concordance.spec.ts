import {
  findOccurrences,
  extractFragment,
  markOccurrences,
} from './concordance';

describe('findOccurrences', () => {
  it('finds regardless of capitals and accents: jehova ↔ Jehová', () => {
    const text = 'Jehová Kunkujshina naingontka, jehovága no';
    const oc = findOccurrences(text, 'jehova');
    expect(oc).toHaveLength(1);
    expect(oc[0]).toEqual({ start: 0, end: 6, word: 'Jehová' });
  });

  it('keeps ʉ: nʉnka does not match nunka or vice versa', () => {
    const text = 'nʉnka nunka nʉnka';
    expect(findOccurrences(text, 'nʉnka')).toHaveLength(2);
    expect(findOccurrences(text, 'nunka')).toHaveLength(1);
  });

  it('keeps ñ: ñingui does not match ningui', () => {
    const text = 'Ñingui tua ningui';
    const oc = findOccurrences(text, 'ñingui');
    expect(oc).toHaveLength(1);
    expect(oc[0].word).toBe('Ñingui');
  });

  it('matches whole words, not substrings', () => {
    const oc = findOccurrences('kʉnʉnka nʉnka', 'nʉnka');
    expect(oc).toHaveLength(1);
    expect(oc[0].start).toBe(8);
  });

  it('trims edge apostrophes but keeps internal ones', () => {
    const oc = findOccurrences("'shke'ta' awa", "shke'ta");
    expect(oc).toHaveLength(1);
    expect(oc[0].word).toBe("shke'ta");
    expect(oc[0].start).toBe(1);
  });

  it('indexes survive ¿? signs and numbers', () => {
    const text = '¿Masheshishka 42 nanu?';
    const oc = findOccurrences(text, 'nanu');
    expect(text.slice(oc[0].start, oc[0].end)).toBe('nanu');
  });
});

describe('markOccurrences', () => {
  it('marks all occurrences of several words (with ʉ and ñ)', () => {
    const text = 'nʉnka gontka ñingui nʉnka';
    const occurrences = [
      ...findOccurrences(text, 'nʉnka'),
      ...findOccurrences(text, 'ñingui'),
    ];
    expect(markOccurrences(text, occurrences)).toBe(
      '<mark>nʉnka</mark> gontka <mark>ñingui</mark> <mark>nʉnka</mark>',
    );
  });

  it('with no occurrences returns the text escaped and with spaces collapsed', () => {
    expect(markOccurrences('a <b>\ncosa', [])).toBe('a &lt;b&gt; cosa');
  });

  it('ignores overlapping occurrences', () => {
    const text = 'nʉnka';
    const oc = findOccurrences(text, 'nʉnka');
    expect(markOccurrences(text, [...oc, ...oc])).toBe('<mark>nʉnka</mark>');
  });
});

describe('extractFragment', () => {
  it('wraps the word in <mark> without trimming short texts', () => {
    const text = 'naka kʉñingui gontka';
    const [oc] = findOccurrences(text, 'kʉñingui');
    expect(extractFragment(text, oc)).toBe('naka <mark>kʉñingui</mark> gontka');
  });

  it('cuts at a word boundary at ±radio and marks with …', () => {
    const filler = 'palabra '.repeat(40); // 320 characters
    const text = `${filler}nʉnka ${filler}`.trim();
    const [oc] = findOccurrences(text, 'nʉnka');
    const frag = extractFragment(text, oc, 120);

    expect(frag.startsWith('…')).toBe(true);
    expect(frag.endsWith('…')).toBe(true);
    expect(frag).toContain('<mark>nʉnka</mark>');
    // never cuts a word in half: only whole words remain
    const textOnly = frag.replace(/…|<\/?mark>/g, '');
    for (const p of textOnly.split(' ').filter(Boolean)) {
      expect(['palabra', 'nʉnka']).toContain(p);
    }
  });

  it('collapses context line breaks to spaces', () => {
    const text = 'primera línea\nsegunda ñingui línea\ntercera';
    const [oc] = findOccurrences(text, 'ñingui');
    expect(extractFragment(text, oc)).toBe(
      'primera línea segunda <mark>ñingui</mark> línea tercera',
    );
  });

  it('escapes corpus HTML outside and inside the <mark>', () => {
    const text = 'a <b> nʉnka & c';
    const [oc] = findOccurrences(text, 'nʉnka');
    expect(extractFragment(text, oc)).toBe(
      'a &lt;b&gt; <mark>nʉnka</mark> &amp; c',
    );
  });
});
