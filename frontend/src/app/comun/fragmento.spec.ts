import { segmentarFragmento } from './fragmento';

describe('segmentarFragmento', () => {
  it('splits words and marks the highlighted one (with ʉ)', () => {
    const segmentos = segmentarFragmento('naka <mark>nʉnka</mark> gontka');
    expect(segmentos).toEqual([
      { texto: 'naka', esPalabra: true, resaltado: false },
      { texto: ' ', esPalabra: false, resaltado: false },
      { texto: 'nʉnka', esPalabra: true, resaltado: true },
      { texto: ' ', esPalabra: false, resaltado: false },
      { texto: 'gontka', esPalabra: true, resaltado: false },
    ]);
  });

  it('unescapes the HTML entities from the backend', () => {
    const segmentos = segmentarFragmento('a &lt;b&gt; <mark>ñingui</mark> &amp; c');
    const textoCompleto = segmentos.map((s) => s.texto).join('');
    expect(textoCompleto).toBe('a <b> ñingui & c');
  });

  it('¿? signs and ellipses are not words', () => {
    const segmentos = segmentarFragmento('…¿<mark>nanu</mark>?…');
    const palabras = segmentos.filter((s) => s.esPalabra);
    expect(palabras).toEqual([{ texto: 'nanu', esPalabra: true, resaltado: true }]);
  });

  it('works with plain text without <mark>', () => {
    const segmentos = segmentarFragmento('ñingui tua');
    expect(segmentos.filter((s) => s.esPalabra).map((s) => s.texto)).toEqual([
      'ñingui',
      'tua',
    ]);
  });
});
