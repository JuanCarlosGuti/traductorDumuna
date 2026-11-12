import { normalize } from '../common/text/normalizer';
import { tokenizeDamana } from '../common/text/tokenizer';
import { TranslationTest } from '../importer/elicitation';
import { chrF } from './chrf';

export interface ResponseToEvaluate {
  traduccion: string;
  palabrasSinEquivalente: string[];
  confianza: number;
}

export interface EvaluatedTest {
  espanol: string;
  esperado: string;
  obtenido: string;
  ambito: string;
  exacta: boolean;
  chrf: number;
  sinEquivalente: string[];
  /** Words without an equivalent / words of the input sentence. */
  proporcionSinEquivalente: number;
  confianza: number;
  error: string | null;
}

export interface ScopeSummary {
  ambito: string;
  pruebas: number;
  exactas: number;
  porcentajeExactas: number;
  chrfMedio: number;
  porcentajeSinEquivalente: number;
  errores: number;
}

export interface Report {
  fecha: string;
  proveedor: string | null;
  modelo: string | null;
  total: ScopeSummary;
  porAmbito: ScopeSummary[];
  pruebas: EvaluatedTest[];
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
  const inputWords = tokenizeDamana(testCase.espanol).length || 1;
  return {
    espanol: testCase.espanol,
    esperado: testCase.damanaEsperado,
    obtenido: response.traduccion,
    ambito: testCase.ambito,
    exacta: isExactMatch(response.traduccion, testCase.damanaEsperado),
    chrf: chrF(response.traduccion, testCase.damanaEsperado),
    sinEquivalente: response.palabrasSinEquivalente,
    proporcionSinEquivalente: Math.min(1, response.palabrasSinEquivalente.length / inputWords),
    confianza: response.confianza,
    error: null,
  };
}

/** A test that could not be translated counts as failed, it is not skipped. */
export function failedTest(testCase: TranslationTest, error: string): EvaluatedTest {
  return {
    espanol: testCase.espanol,
    esperado: testCase.damanaEsperado,
    obtenido: '',
    ambito: testCase.ambito,
    exacta: false,
    chrf: 0,
    sinEquivalente: [],
    proporcionSinEquivalente: 1,
    confianza: 0,
    error,
  };
}

const mean = (values: number[]): number =>
  values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;

export function summarize(testCases: EvaluatedTest[], scope: string): ScopeSummary {
  const exactOnes = testCases.filter((p) => p.exacta).length;
  return {
    ambito: scope,
    pruebas: testCases.length,
    exactas: exactOnes,
    porcentajeExactas: testCases.length ? (100 * exactOnes) / testCases.length : 0,
    chrfMedio: mean(testCases.map((p) => p.chrf)),
    porcentajeSinEquivalente: 100 * mean(testCases.map((p) => p.proporcionSinEquivalente)),
    errores: testCases.filter((p) => p.error !== null).length,
  };
}

export function buildReport(
  testCases: EvaluatedTest[],
  meta: { fecha: Date; proveedor: string | null; modelo: string | null },
): Report {
  const scopes = [...new Set(testCases.map((p) => p.ambito))].sort((a, b) => a.localeCompare(b, 'es'));
  return {
    fecha: meta.fecha.toISOString(),
    proveedor: meta.proveedor,
    modelo: meta.modelo,
    total: summarize(testCases, 'TOTAL'),
    porAmbito: scopes.map((a) => summarize(testCases.filter((p) => p.ambito === a), a)),
    pruebas: testCases,
  };
}

const pct = (v: number): string => `${v.toFixed(1)} %`;

export function renderMarkdown(report: Report): string {
  const rows = [...report.porAmbito, report.total]
    .map(
      (r) =>
        `| ${r.ambito} | ${r.pruebas} | ${r.exactas} (${pct(r.porcentajeExactas)}) | ${r.chrfMedio.toFixed(3)} | ${pct(r.porcentajeSinEquivalente)} | ${r.errores} |`,
    )
    .join('\n');
  const detail = report.pruebas
    .map((p) => {
      const status = p.error ? `ERROR: ${p.error}` : p.exacta ? 'exacta' : `chrF ${p.chrf.toFixed(3)}`;
      const missing = p.sinEquivalente.length ? ` · sin equivalente: ${p.sinEquivalente.join(', ')}` : '';
      return `- **${p.espanol}** (${p.ambito})\n  - esperado: ${p.esperado}\n  - obtenido: ${p.obtenido || '—'}\n  - ${status}${missing}`;
    })
    .join('\n');
  return (
    `# Evaluación del traductor — ${report.fecha.slice(0, 16).replace('T', ' ')}\n\n` +
    `Motor: ${report.proveedor ?? '—'} · modelo: ${report.modelo ?? '—'} · pruebas: ${report.total.pruebas}\n\n` +
    '| ámbito | pruebas | exactas | chrF medio | sin equivalente | errores |\n' +
    '|---|---:|---:|---:|---:|---:|\n' +
    `${rows}\n\n## Detalle\n\n${detail}\n`
  );
}

/** 2026-10-03_1430_openai-gpt-oss-120b */
export function reportBaseName(date: Date, model: string | null): string {
  const iso = date.toISOString();
  const mark = `${iso.slice(0, 10)}_${iso.slice(11, 13)}${iso.slice(14, 16)}`;
  const cleaned = (model ?? 'sin-modelo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${mark}_${cleaned}`;
}
