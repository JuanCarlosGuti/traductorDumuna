import {
  buscarOcurrencias,
  extraerFragmento,
  marcarOcurrencias,
} from './concordancia';

describe('buscarOcurrencias', () => {
  it('encuentra sin importar mayúsculas ni tildes: jehova ↔ Jehová', () => {
    const texto = 'Jehová Kunkujshina naingontka, jehovága no';
    const oc = buscarOcurrencias(texto, 'jehova');
    expect(oc).toHaveLength(1);
    expect(oc[0]).toEqual({ inicio: 0, fin: 6, palabra: 'Jehová' });
  });

  it('conserva ʉ: nʉnka no matchea nunka ni al revés', () => {
    const texto = 'nʉnka nunka nʉnka';
    expect(buscarOcurrencias(texto, 'nʉnka')).toHaveLength(2);
    expect(buscarOcurrencias(texto, 'nunka')).toHaveLength(1);
  });

  it('conserva ñ: ñingui no matchea ningui', () => {
    const texto = 'Ñingui tua ningui';
    const oc = buscarOcurrencias(texto, 'ñingui');
    expect(oc).toHaveLength(1);
    expect(oc[0].palabra).toBe('Ñingui');
  });

  it('matchea palabras completas, no substrings', () => {
    const oc = buscarOcurrencias('kʉnʉnka nʉnka', 'nʉnka');
    expect(oc).toHaveLength(1);
    expect(oc[0].inicio).toBe(8);
  });

  it('recorta apóstrofes de borde pero conserva los internos', () => {
    const oc = buscarOcurrencias("'shke'ta' awa", "shke'ta");
    expect(oc).toHaveLength(1);
    expect(oc[0].palabra).toBe("shke'ta");
    expect(oc[0].inicio).toBe(1);
  });

  it('los índices sobreviven a signos ¿? y números', () => {
    const texto = '¿Masheshishka 42 nanu?';
    const oc = buscarOcurrencias(texto, 'nanu');
    expect(texto.slice(oc[0].inicio, oc[0].fin)).toBe('nanu');
  });
});

describe('marcarOcurrencias', () => {
  it('marca todas las ocurrencias de varias palabras (con ʉ y ñ)', () => {
    const texto = 'nʉnka gontka ñingui nʉnka';
    const ocurrencias = [
      ...buscarOcurrencias(texto, 'nʉnka'),
      ...buscarOcurrencias(texto, 'ñingui'),
    ];
    expect(marcarOcurrencias(texto, ocurrencias)).toBe(
      '<mark>nʉnka</mark> gontka <mark>ñingui</mark> <mark>nʉnka</mark>',
    );
  });

  it('sin ocurrencias devuelve el texto escapado y con espacios colapsados', () => {
    expect(marcarOcurrencias('a <b>\ncosa', [])).toBe('a &lt;b&gt; cosa');
  });

  it('ignora ocurrencias solapadas', () => {
    const texto = 'nʉnka';
    const oc = buscarOcurrencias(texto, 'nʉnka');
    expect(marcarOcurrencias(texto, [...oc, ...oc])).toBe('<mark>nʉnka</mark>');
  });
});

describe('extraerFragmento', () => {
  it('envuelve la palabra en <mark> sin recortar textos cortos', () => {
    const texto = 'naka kʉñingui gontka';
    const [oc] = buscarOcurrencias(texto, 'kʉñingui');
    expect(extraerFragmento(texto, oc)).toBe('naka <mark>kʉñingui</mark> gontka');
  });

  it('corta en límite de palabra a ±radio y marca con …', () => {
    const relleno = 'palabra '.repeat(40); // 320 caracteres
    const texto = `${relleno}nʉnka ${relleno}`.trim();
    const [oc] = buscarOcurrencias(texto, 'nʉnka');
    const frag = extraerFragmento(texto, oc, 120);

    expect(frag.startsWith('…')).toBe(true);
    expect(frag.endsWith('…')).toBe(true);
    expect(frag).toContain('<mark>nʉnka</mark>');
    // nunca corta una palabra por la mitad: solo quedan palabras enteras
    const soloTexto = frag.replace(/…|<\/?mark>/g, '');
    for (const p of soloTexto.split(' ').filter(Boolean)) {
      expect(['palabra', 'nʉnka']).toContain(p);
    }
  });

  it('colapsa saltos de línea del contexto a espacios', () => {
    const texto = 'primera línea\nsegunda ñingui línea\ntercera';
    const [oc] = buscarOcurrencias(texto, 'ñingui');
    expect(extraerFragmento(texto, oc)).toBe(
      'primera línea segunda <mark>ñingui</mark> línea tercera',
    );
  });

  it('escapa HTML del corpus fuera y dentro del <mark>', () => {
    const texto = 'a <b> nʉnka & c';
    const [oc] = buscarOcurrencias(texto, 'nʉnka');
    expect(extraerFragmento(texto, oc)).toBe(
      'a &lt;b&gt; <mark>nʉnka</mark> &amp; c',
    );
  });
});
