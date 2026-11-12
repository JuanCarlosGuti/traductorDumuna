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
  const testCase = { spanish: 'mi mamá cocina', expectedDamana: 'ranzhe abu dugwa', scope: 'familia' };

  it('computes exact, chrF and the proportion of words without an equivalent', () => {
    const exact = evaluateTest(testCase, { translation: 'Ranzhe abu dugwa.', wordsWithoutEquivalent: [], confidence: 0.9 });
    expect(exact.exact).toBe(true);
    expect(exact.chrf).toBeGreaterThan(0.99);
    expect(exact.withoutEquivalentRatio).toBe(0);

    const partial = evaluateTest(testCase, { translation: 'ranzhe [mamá] dugwa', wordsWithoutEquivalent: ['mamá'], confidence: 0.4 });
    expect(partial.exact).toBe(false);
    expect(partial.chrf).toBeGreaterThan(0.3);
    expect(partial.chrf).toBeLessThan(1);
    expect(partial.withoutEquivalentRatio).toBeCloseTo(1 / 3, 10);
  });

  it('a failed test counts as 0 and is not skipped', () => {
    const failed = failedTest(testCase, 'timeout');
    expect(failed).toMatchObject({ exact: false, chrf: 0, withoutEquivalentRatio: 1, error: 'timeout' });
  });

  it('summarizes by scope and in total', () => {
    const testCases = [
      evaluateTest(testCase, { translation: 'ranzhe abu dugwa', wordsWithoutEquivalent: [], confidence: 1 }),
      evaluateTest({ ...testCase, scope: 'comida', spanish: 'como yuca', expectedDamana: 'irrugwa zhant' }, { translation: '[yuca] zhant', wordsWithoutEquivalent: ['yuca'], confidence: 0.2 }),
      failedTest({ ...testCase, scope: 'comida' }, 'error'),
    ];
    const report = buildReport(testCases, { date: new Date('2026-10-03T14:30:00.000Z'), provider: 'compatible', model: 'openai/gpt-oss-120b' });
    expect(report.total).toMatchObject({ scope: 'TOTAL', tests: 3, exactCount: 1, errors: 1 });
    expect(report.total.exactPercent).toBeCloseTo(33.33, 1);
    expect(report.byScope.map((r) => r.scope)).toEqual(['comida', 'familia']);
    const family = report.byScope.find((r) => r.scope === 'familia')!;
    expect(family).toMatchObject({ tests: 1, exactCount: 1, exactPercent: 100, withoutEquivalentPercent: 0 });
    const comida = summarize(testCases.filter((p) => p.scope === 'comida'), 'comida');
    expect(comida.withoutEquivalentPercent).toBeCloseTo(75, 5); // (0.5 + 1) / 2
  });

  it('renders the report in Markdown with the per-scope table and the detail', () => {
    const report = buildReport(
      [evaluateTest(testCase, { translation: 'ranzhe abu dugwa', wordsWithoutEquivalent: [], confidence: 1 })],
      { date: new Date('2026-10-03T14:30:00.000Z'), provider: 'compatible', model: 'm' },
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
