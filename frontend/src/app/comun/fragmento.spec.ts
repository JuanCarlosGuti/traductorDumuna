import { segmentarFragmento } from './fragmento';

describe('segmentarFragmento', () => {
  it('separa palabras y marca la resaltada (con ʉ)', () => {
    const segmentos = segmentarFragmento('naka <mark>nʉnka</mark> gontka');
    expect(segmentos).toEqual([
      { texto: 'naka', esPalabra: true, resaltado: false },
      { texto: ' ', esPalabra: false, resaltado: false },
      { texto: 'nʉnka', esPalabra: true, resaltado: true },
      { texto: ' ', esPalabra: false, resaltado: false },
      { texto: 'gontka', esPalabra: true, resaltado: false },
    ]);
  });

  it('desescapa las entidades HTML del backend', () => {
    const segmentos = segmentarFragmento('a &lt;b&gt; <mark>ñingui</mark> &amp; c');
    const textoCompleto = segmentos.map((s) => s.texto).join('');
    expect(textoCompleto).toBe('a <b> ñingui & c');
  });

  it('los signos ¿? y las elipsis no son palabras', () => {
    const segmentos = segmentarFragmento('…¿<mark>nanu</mark>?…');
    const palabras = segmentos.filter((s) => s.esPalabra);
    expect(palabras).toEqual([{ texto: 'nanu', esPalabra: true, resaltado: true }]);
  });

  it('funciona con texto plano sin <mark>', () => {
    const segmentos = segmentarFragmento('ñingui tua');
    expect(segmentos.filter((s) => s.esPalabra).map((s) => s.texto)).toEqual([
      'ñingui',
      'tua',
    ]);
  });
});
