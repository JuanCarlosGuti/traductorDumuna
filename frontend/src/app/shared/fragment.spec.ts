import { segmentFragment } from './fragment';

describe('segmentFragment', () => {
  it('splits words and marks the highlighted one (with ʉ)', () => {
    const segments = segmentFragment('naka <mark>nʉnka</mark> gontka');
    expect(segments).toEqual([
      { text: 'naka', isWord: true, highlighted: false },
      { text: ' ', isWord: false, highlighted: false },
      { text: 'nʉnka', isWord: true, highlighted: true },
      { text: ' ', isWord: false, highlighted: false },
      { text: 'gontka', isWord: true, highlighted: false },
    ]);
  });

  it('unescapes the HTML entities from the backend', () => {
    const segments = segmentFragment('a &lt;b&gt; <mark>ñingui</mark> &amp; c');
    const fullText = segments.map((s) => s.text).join('');
    expect(fullText).toBe('a <b> ñingui & c');
  });

  it('¿? signs and ellipses are not words', () => {
    const segments = segmentFragment('…¿<mark>nanu</mark>?…');
    const words = segments.filter((s) => s.isWord);
    expect(words).toEqual([{ text: 'nanu', isWord: true, highlighted: true }]);
  });

  it('works with plain text without <mark>', () => {
    const segments = segmentFragment('ñingui tua');
    expect(segments.filter((s) => s.isWord).map((s) => s.text)).toEqual([
      'ñingui',
      'tua',
    ]);
  });
});
