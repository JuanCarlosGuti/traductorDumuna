import { segmentFragment } from './fragment';

describe('segmentFragment', () => {
  it('splits words and marks the highlighted one (with ʉ)', () => {
    const segments = segmentFragment('naka <mark>nʉnka</mark> gontka');
    expect(segments).toEqual([
      { texto: 'naka', esPalabra: true, resaltado: false },
      { texto: ' ', esPalabra: false, resaltado: false },
      { texto: 'nʉnka', esPalabra: true, resaltado: true },
      { texto: ' ', esPalabra: false, resaltado: false },
      { texto: 'gontka', esPalabra: true, resaltado: false },
    ]);
  });

  it('unescapes the HTML entities from the backend', () => {
    const segments = segmentFragment('a &lt;b&gt; <mark>ñingui</mark> &amp; c');
    const fullText = segments.map((s) => s.texto).join('');
    expect(fullText).toBe('a <b> ñingui & c');
  });

  it('¿? signs and ellipses are not words', () => {
    const segments = segmentFragment('…¿<mark>nanu</mark>?…');
    const words = segments.filter((s) => s.esPalabra);
    expect(words).toEqual([{ texto: 'nanu', esPalabra: true, resaltado: true }]);
  });

  it('works with plain text without <mark>', () => {
    const segments = segmentFragment('ñingui tua');
    expect(segments.filter((s) => s.esPalabra).map((s) => s.texto)).toEqual([
      'ñingui',
      'tua',
    ]);
  });
});
