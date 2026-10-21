import {
  construirInforme,
  esCoincidenciaExacta,
  evaluarPrueba,
  nombreBaseInforme,
  pruebaFallida,
  renderizarMarkdown,
  resumir,
  textoComparable,
} from './evaluador';

describe('coincidencia exacta', () => {
  it('ignora mayúsculas, puntuación y espacios de más, pero no ʉ ni ñ', () => {
    expect(textoComparable('  Nʉnka   shkua. ')).toBe('nʉnka shkua');
    expect(esCoincidenciaExacta('Nʉnka shkua.', 'nʉnka shkua')).toBe(true);
    expect(esCoincidenciaExacta('nunka shkua', 'nʉnka shkua')).toBe(false);
    expect(esCoincidenciaExacta('ningui', 'ñingui')).toBe(false);
  });
});

describe('evaluarPrueba y resumen', () => {
  const prueba = { espanol: 'mi mamá cocina', damanaEsperado: 'ranzhe abu dugwa', ambito: 'familia' };

  it('calcula exacta, chrF y la proporción de palabras sin equivalente', () => {
    const exacta = evaluarPrueba(prueba, { traduccion: 'Ranzhe abu dugwa.', palabrasSinEquivalente: [], confianza: 0.9 });
    expect(exacta.exacta).toBe(true);
    expect(exacta.chrf).toBeGreaterThan(0.99);
    expect(exacta.proporcionSinEquivalente).toBe(0);

    const parcial = evaluarPrueba(prueba, { traduccion: 'ranzhe [mamá] dugwa', palabrasSinEquivalente: ['mamá'], confianza: 0.4 });
    expect(parcial.exacta).toBe(false);
    expect(parcial.chrf).toBeGreaterThan(0.3);
    expect(parcial.chrf).toBeLessThan(1);
    expect(parcial.proporcionSinEquivalente).toBeCloseTo(1 / 3, 10);
  });

  it('una prueba fallida cuenta como 0 y no se omite', () => {
    const fallida = pruebaFallida(prueba, 'timeout');
    expect(fallida).toMatchObject({ exacta: false, chrf: 0, proporcionSinEquivalente: 1, error: 'timeout' });
  });

  it('resume por ámbito y en total', () => {
    const pruebas = [
      evaluarPrueba(prueba, { traduccion: 'ranzhe abu dugwa', palabrasSinEquivalente: [], confianza: 1 }),
      evaluarPrueba({ ...prueba, ambito: 'comida', espanol: 'como yuca', damanaEsperado: 'irrugwa zhant' }, { traduccion: '[yuca] zhant', palabrasSinEquivalente: ['yuca'], confianza: 0.2 }),
      pruebaFallida({ ...prueba, ambito: 'comida' }, 'error'),
    ];
    const informe = construirInforme(pruebas, { fecha: new Date('2026-10-03T14:30:00.000Z'), proveedor: 'compatible', modelo: 'openai/gpt-oss-120b' });
    expect(informe.total).toMatchObject({ ambito: 'TOTAL', pruebas: 3, exactas: 1, errores: 1 });
    expect(informe.total.porcentajeExactas).toBeCloseTo(33.33, 1);
    expect(informe.porAmbito.map((r) => r.ambito)).toEqual(['comida', 'familia']);
    const familia = informe.porAmbito.find((r) => r.ambito === 'familia')!;
    expect(familia).toMatchObject({ pruebas: 1, exactas: 1, porcentajeExactas: 100, porcentajeSinEquivalente: 0 });
    const comida = resumir(pruebas.filter((p) => p.ambito === 'comida'), 'comida');
    expect(comida.porcentajeSinEquivalente).toBeCloseTo(75, 5); // (0,5 + 1) / 2
  });

  it('renderiza el informe en Markdown con la tabla por ámbito y el detalle', () => {
    const informe = construirInforme(
      [evaluarPrueba(prueba, { traduccion: 'ranzhe abu dugwa', palabrasSinEquivalente: [], confianza: 1 })],
      { fecha: new Date('2026-10-03T14:30:00.000Z'), proveedor: 'compatible', modelo: 'm' },
    );
    const md = renderizarMarkdown(informe);
    expect(md).toContain('| ámbito | pruebas | exactas | chrF medio | sin equivalente | errores |');
    expect(md).toContain('| familia | 1 | 1 (100.0 %) |');
    expect(md).toContain('**mi mamá cocina** (familia)');
  });

  it('el nombre del informe lleva fecha, hora y modelo saneado', () => {
    expect(nombreBaseInforme(new Date('2026-10-03T14:30:00.000Z'), 'openai/gpt-oss-120b')).toBe('2026-10-03_1430_openai-gpt-oss-120b');
    expect(nombreBaseInforme(new Date('2026-10-03T14:30:00.000Z'), null)).toBe('2026-10-03_1430_sin-modelo');
  });
});
