import {
  buildReport,
  isExactMatch,
  evaluateTest,
  reportBaseName,
  failedTest,
  renderMarkdown,
  summarize,
  comparableText,
} from './evaluator';

describe('exact match', () => {
  it('ignores capitals, punctuation and extra spaces, but not ʉ or ñ', () => {
    expect(comparableText('  Nʉnka   shkua. ')).toBe('nʉnka shkua');
    expect(isExactMatch('Nʉnka shkua.', 'nʉnka shkua')).toBe(true);
    expect(isExactMatch('nunka shkua', 'nʉnka shkua')).toBe(false);
    expect(isExactMatch('ningui', 'ñingui')).toBe(false);
  });
});

describe('evaluateTest and summary', () => {
  const testCase = { espanol: 'mi mamá cocina', damanaEsperado: 'ranzhe abu dugwa', ambito: 'familia' };

  it('computes exact, chrF and the proportion of words without an equivalent', () => {
    const exact = evaluateTest(testCase, { traduccion: 'Ranzhe abu dugwa.', palabrasSinEquivalente: [], confianza: 0.9 });
    expect(exact.exacta).toBe(true);
    expect(exact.chrf).toBeGreaterThan(0.99);
    expect(exact.proporcionSinEquivalente).toBe(0);

    const partial = evaluateTest(testCase, { traduccion: 'ranzhe [mamá] dugwa', palabrasSinEquivalente: ['mamá'], confianza: 0.4 });
    expect(partial.exacta).toBe(false);
    expect(partial.chrf).toBeGreaterThan(0.3);
    expect(partial.chrf).toBeLessThan(1);
    expect(partial.proporcionSinEquivalente).toBeCloseTo(1 / 3, 10);
  });

  it('a failed test counts as 0 and is not skipped', () => {
    const failed = failedTest(testCase, 'timeout');
    expect(failed).toMatchObject({ exacta: false, chrf: 0, proporcionSinEquivalente: 1, error: 'timeout' });
  });

  it('summarizes by scope and in total', () => {
    const testCases = [
      evaluateTest(testCase, { traduccion: 'ranzhe abu dugwa', palabrasSinEquivalente: [], confianza: 1 }),
      evaluateTest({ ...testCase, ambito: 'comida', espanol: 'como yuca', damanaEsperado: 'irrugwa zhant' }, { traduccion: '[yuca] zhant', palabrasSinEquivalente: ['yuca'], confianza: 0.2 }),
      failedTest({ ...testCase, ambito: 'comida' }, 'error'),
    ];
    const report = buildReport(testCases, { fecha: new Date('2026-10-03T14:30:00.000Z'), proveedor: 'compatible', modelo: 'openai/gpt-oss-120b' });
    expect(report.total).toMatchObject({ ambito: 'TOTAL', pruebas: 3, exactas: 1, errores: 1 });
    expect(report.total.porcentajeExactas).toBeCloseTo(33.33, 1);
    expect(report.porAmbito.map((r) => r.ambito)).toEqual(['comida', 'familia']);
    const family = report.porAmbito.find((r) => r.ambito === 'familia')!;
    expect(family).toMatchObject({ pruebas: 1, exactas: 1, porcentajeExactas: 100, porcentajeSinEquivalente: 0 });
    const comida = summarize(testCases.filter((p) => p.ambito === 'comida'), 'comida');
    expect(comida.porcentajeSinEquivalente).toBeCloseTo(75, 5); // (0.5 + 1) / 2
  });

  it('renders the report in Markdown with the per-scope table and the detail', () => {
    const report = buildReport(
      [evaluateTest(testCase, { traduccion: 'ranzhe abu dugwa', palabrasSinEquivalente: [], confianza: 1 })],
      { fecha: new Date('2026-10-03T14:30:00.000Z'), proveedor: 'compatible', modelo: 'm' },
    );
    const md = renderMarkdown(report);
    expect(md).toContain('| ámbito | pruebas | exactas | chrF medio | sin equivalente | errores |');
    expect(md).toContain('| familia | 1 | 1 (100.0 %) |');
    expect(md).toContain('**mi mamá cocina** (familia)');
  });

  it('the report name carries date, time and sanitized model', () => {
    expect(reportBaseName(new Date('2026-10-03T14:30:00.000Z'), 'openai/gpt-oss-120b')).toBe('2026-10-03_1430_openai-gpt-oss-120b');
    expect(reportBaseName(new Date('2026-10-03T14:30:00.000Z'), null)).toBe('2026-10-03_1430_sin-modelo');
  });
});
