import { CorpusSource } from '../consulta/consulta.enums';

export type SupportLevel = 'bueno' | 'parcial' | 'revisar';

/**
 * Thresholds on the MEAN of the K retrieval scores. The score of the
 * best example (top) is misleading — it may come from a dictionary entry that
 * contains the literal word — whereas the mean reflects how much real
 * context backs the translation.
 *
 * Calibrated on 42 corpus queries (Jul 2026):
 *   covered    median 0.280 (range 0.247-0.387)
 *   uncovered  median 0.187 (range 0.099-0.302)
 * With 0.20, 55% of the uncovered ones are detected with NO false positives; raising it
 * to 0.30 would detect 95% but flag 70% of the good ones, and a warning that
 * always fires ends up being ignored.
 *
 * Levels are derived on the fly from what is logged in `traducciones`, they are not
 * stored: that way, recalibrating these thresholds also reinterprets the history.
 */
export const REVIEW_THRESHOLD = 0.2;
export const GOOD_THRESHOLD = 0.32;

export interface SupportSignals {
  puntajeMedio: number;
  fuenteTop: CorpusSource | null;
  ejemplosRecuperados: number;
  /**
   * Examples that come from sentences or phrases, i.e. from the language in use.
   * `null` in translations logged before it was measured (v5): then
   * it falls back to the old top-1 heuristic.
   */
  ejemplosEnContexto?: number | null;
}

export interface Support {
  nivel: SupportLevel;
  /** Reasons why it was flagged «revisar»; empty at the other levels. */
  motivos: string[];
}

/**
 * Does no example show the language in use? With the measured signal it is enough
 * to count it; in old records, which lack it, the original
 * heuristic is kept so as not to reinterpret the history blindly.
 */
function withoutContext(signals: SupportSignals): boolean {
  return signals.ejemplosEnContexto == null
    ? signals.fuenteTop === CorpusSource.conjugaciones
    : signals.ejemplosEnContexto === 0 && signals.ejemplosRecuperados > 0;
}

export function evaluateSupport(signals: SupportSignals): Support {
  const reasons: string[] = [];

  if (signals.ejemplosRecuperados === 0) {
    reasons.push('sin_ejemplos');
  }
  if (signals.puntajeMedio < REVIEW_THRESHOLD) {
    reasons.push('similitud_baja');
  }
  // All the support is entries from the conjugations table: they confirm the
  // verb form, but none shows real usage. (The vocabulary does not
  // take part in retrieval; it goes separately in the prompt.)
  //
  // The context is counted instead of looking only at the top-1: since
  // retrieval expands by verb root, a query like «naijkasheshisha»
  // leads with its own conjugation (exact match) but brings
  // six sentences and phrases with the verb underneath. There the support is NOT
  // dictionary-only, and the old warning was wrong.
  if (withoutContext(signals)) {
    reasons.push('apoyo_solo_de_diccionario');
  }

  if (reasons.length > 0) return { nivel: 'revisar', motivos: reasons };
  if (signals.puntajeMedio < GOOD_THRESHOLD) return { nivel: 'parcial', motivos: [] };
  return { nivel: 'bueno', motivos: [] };
}
