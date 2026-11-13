import { normalize } from '../common/text/normalizer';
import { tokenizeDamana } from '../common/text/tokenizer';
import { TranslationTest } from '../importer/elicitation';
import { chrF } from './chrf';

export interface ResponseToEvaluate {
  translation: string;
  wordsWithoutEquivalent: string[];
  confidence: number;
}

export interface EvaluatedTest {
  spanish: string;
  expected: string;
  obtained: string;
  scope: string;
  exact: boolean;
  chrf: number;
  withoutEquivalent: string[];
  /** Words without an equivalent / words of the input sentence. */
  withoutEquivalentRatio: number;
  confidence: number;
  error: string | null;
}

export interface ScopeSummary {
  scope: string;
  tests: number;
  exactCount: number;
  exactPercent: number;
  meanChrf: number;
  withoutEquivalentPercent: number;
  errors: number;
}

export interface Report {
  date: string;
  provider: string | null;
  model: string | null;
  total: ScopeSummary;
  byScope: ScopeSummary[];
  tests: EvaluatedTest[];
}

/**
 * Comparable text for the exact match: lowercase, no accents
 * (ʉ and ñ intact), no punctuation and with spaces collapsed. So
 * «Nʉnka shkua.» and «nʉnka shkua» count as equal, but «nunka» does not.
 */
export function comparableText(text: string): string {
  return normalize(text)
    .replace(/[^\p{L}ʉ'\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isExactMatch(obtained: string, expected: string): boolean {
  return comparableText(obtained) === comparableText(expected);
}

export function evaluateTest(testCase: TranslationTest, response: ResponseToEvaluate): EvaluatedTest {
  const inputWords = tokenizeDamana(testCase.spanish).length || 1;
  return {
    spanish: testCase.spanish,
    expected: testCase.expectedDamana,
    obtained: response.translation,
    scope: testCase.scope,
    exact: isExactMatch(response.translation, testCase.expectedDamana),
    chrf: chrF(response.translation, testCase.expectedDamana),
    withoutEquivalent: response.wordsWithoutEquivalent,
    withoutEquivalentRatio: Math.min(1, response.wordsWithoutEquivalent.length / inputWords),
    confidence: response.confidence,
    error: null,
  };
}

/** A test that could not be translated counts as failed, it is not skipped. */
export function failedTest(testCase: TranslationTest, error: string): EvaluatedTest {
  return {
    spanish: testCase.spanish,
    expected: testCase.expectedDamana,
    obtained: '',
    scope: testCase.scope,
    exact: false,
    chrf: 0,
    withoutEquivalent: [],
    withoutEquivalentRatio: 1,
    confidence: 0,
    error,
  };
}

const mean = (values: number[]): number =>
  values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;

export function summarize(testCases: EvaluatedTest[], scope: string): ScopeSummary {
  const exactOnes = testCases.filter((p) => p.exact).length;
  return {
    scope: scope,
    tests: testCases.length,
    exactCount: exactOnes,
    exactPercent: testCases.length ? (100 * exactOnes) / testCases.length : 0,
    meanChrf: mean(testCases.map((p) => p.chrf)),
    withoutEquivalentPercent: 100 * mean(testCases.map((p) => p.withoutEquivalentRatio)),
    errors: testCases.filter((p) => p.error !== null).length,
  };
}

export function buildReport(
  testCases: EvaluatedTest[],
  meta: { date: Date; provider: string | null; model: string | null },
): Report {
  const scopes = [...new Set(testCases.map((p) => p.scope))].sort((a, b) => a.localeCompare(b, 'es'));
  return {
    date: meta.date.toISOString(),
    provider: meta.provider,
    model: meta.model,
    total: summarize(testCases, 'TOTAL'),
    byScope: scopes.map((a) => summarize(testCases.filter((p) => p.scope === a), a)),
    tests: testCases,
  };
}

const pct = (v: number): string => `${v.toFixed(1)} %`;

export function renderMarkdown(report: Report): string {
  const rows = [...report.byScope, report.total]
    .map(
      (r) =>
        `| ${r.scope} | ${r.tests} | ${r.exactCount} (${pct(r.exactPercent)}) | ${r.meanChrf.toFixed(3)} | ${pct(r.withoutEquivalentPercent)} | ${r.errors} |`,
    )
    .join('\n');
  const detail = report.tests
    .map((p) => {
      const status = p.error ? `ERROR: ${p.error}` : p.exact ? 'exact' : `chrF ${p.chrf.toFixed(3)}`;
      const missing = p.withoutEquivalent.length ? ` · without equivalent: ${p.withoutEquivalent.join(', ')}` : '';
      return `- **${p.spanish}** (${p.scope})\n  - expected: ${p.expected}\n  - obtained: ${p.obtained || '—'}\n  - ${status}${missing}`;
    })
    .join('\n');
  return (
    `# Translator evaluation — ${report.date.slice(0, 16).replace('T', ' ')}\n\n` +
    `Engine: ${report.provider ?? '—'} · model: ${report.model ?? '—'} · tests: ${report.total.tests}\n\n` +
    '| scope | tests | exact | mean chrF | without equivalent | errors |\n' +
    '|---|---:|---:|---:|---:|---:|\n' +
    `${rows}\n\n## Details\n\n${detail}\n`
  );
}

/** 2026-10-03_1430_openai-gpt-oss-120b */
export function reportBaseName(date: Date, model: string | null): string {
  const iso = date.toISOString();
  const mark = `${iso.slice(0, 10)}_${iso.slice(11, 13)}${iso.slice(14, 16)}`;
  const cleaned = (model ?? 'no-model').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${mark}_${cleaned}`;
}
