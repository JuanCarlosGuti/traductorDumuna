import { FuenteCorpus } from '../consulta/consulta.enums';

export type NivelApoyo = 'bueno' | 'parcial' | 'revisar';

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
export const UMBRAL_REVISAR = 0.2;
export const UMBRAL_BUENO = 0.32;

export interface SenalesApoyo {
  puntajeMedio: number;
  fuenteTop: FuenteCorpus | null;
  ejemplosRecuperados: number;
  /**
   * Examples that come from sentences or phrases, i.e. from the language in use.
   * `null` in translations logged before it was measured (v5): then
   * it falls back to the old top-1 heuristic.
   */
  ejemplosEnContexto?: number | null;
}

export interface Apoyo {
  nivel: NivelApoyo;
  /** Reasons why it was flagged «revisar»; empty at the other levels. */
  motivos: string[];
}

/**
 * Does no example show the language in use? With the measured signal it is enough
 * to count it; in old records, which lack it, the original
 * heuristic is kept so as not to reinterpret the history blindly.
 */
function sinContexto(senales: SenalesApoyo): boolean {
  return senales.ejemplosEnContexto == null
    ? senales.fuenteTop === FuenteCorpus.conjugaciones
    : senales.ejemplosEnContexto === 0 && senales.ejemplosRecuperados > 0;
}

export function evaluarApoyo(senales: SenalesApoyo): Apoyo {
  const motivos: string[] = [];

  if (senales.ejemplosRecuperados === 0) {
    motivos.push('sin_ejemplos');
  }
  if (senales.puntajeMedio < UMBRAL_REVISAR) {
    motivos.push('similitud_baja');
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
  if (sinContexto(senales)) {
    motivos.push('apoyo_solo_de_diccionario');
  }

  if (motivos.length > 0) return { nivel: 'revisar', motivos };
  if (senales.puntajeMedio < UMBRAL_BUENO) return { nivel: 'parcial', motivos: [] };
  return { nivel: 'bueno', motivos: [] };
}
