import { normalize } from '../common/text/normalizer';
import { normalizeWrittenDamana } from '../common/text/spelling';

/** Row of the elicitation format («elicitacion» sheet), already cleaned. */
export interface ElicitationRow {
  id: string;
  ambito: string;
  palabraEs: string;
  palabraDm: string;
  ejemploEs: string;
  ejemploDm: string;
  variante: string;
  notas: string;
  /** File it came from (for traceability). */
  archivo: string;
}

export interface ElicitedVocabulary {
  espanol: string;
  damana: string;
  categoria: string;
  notas: string;
  fuente: string;
}

export interface ElicitedSentence {
  idExterno: string;
  damana: string;
  espanol: string;
  fuente: string;
}

export interface TranslationTest {
  espanol: string;
  damanaEsperado: string;
  ambito: string;
}

export interface ElicitationPendingItem {
  palabra: string;
  contexto: string;
}

export interface ElicitationPlan {
  vocabulario: ElicitedVocabulary[];
  oraciones: ElicitedSentence[];
  pruebas: TranslationTest[];
  pendientes: ElicitationPendingItem[];
  /** Words that arrived complete: they close their pending item if there was one. */
  resueltas: string[];
  /** ids repeated across files: the last occurrence was kept. */
  idsRepetidos: number;
}

export const ELICITATION_SOURCE = 'elicitacion';

/** One in every TEST_PROPORTION complete rows is reserved for evaluation. */
export const TEST_PROPORTION = 10;

/**
 * 32-bit FNV-1a hash: stable across runs and platforms. It is used
 * instead of «every tenth row» so that a row reserved as a test
 * stays one even if more batches arrive or the order changes: if the
 * reservation moved, yesterday's test would be a retrieval example today and
 * the evaluation would stop being comparable across versions.
 */
export function stableHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function isTestRow(id: string): boolean {
  return stableHash(id.trim()) % TEST_PROPORTION === 0;
}

/** Converts a raw row (normalized headers) into a ElicitationRow. */
export function parseRow(
  raw: Record<string, string>,
  file: string,
): ElicitationRow | null {
  const id = (raw['id'] ?? '').trim();
  const wordEs = (raw['palabra_es'] ?? '').trim();
  if (!id && !wordEs) return null;
  return {
    id,
    ambito: (raw['ambito'] ?? '').trim().toLowerCase() || 'otro',
    palabraEs: wordEs,
    palabraDm: normalizeWrittenDamana((raw['palabra_dm'] ?? '').trim()),
    ejemploEs: (raw['ejemplo_es'] ?? '').trim(),
    ejemploDm: normalizeWrittenDamana((raw['ejemplo_dm'] ?? '').trim()),
    variante: (raw['variante'] ?? '').trim().toLowerCase(),
    notas: (raw['notas'] ?? '').trim(),
    archivo: file,
  };
}

/**
 * Merges several batches into one: the id rules (idempotent by id), and if an id
 * appears in more than one file the last one in alphabetical file
 * order wins, which is the most recent by naming convention.
 */
export function mergeById(rows: ElicitationRow[]): {
  filas: ElicitationRow[];
  repetidos: number;
} {
  const byId = new Map<string, ElicitationRow>();
  let repeated = 0;
  for (const row of rows) {
    const key = row.id || `sin-id:${normalize(row.palabraEs)}`;
    if (byId.has(key)) repeated++;
    byId.set(key, row);
  }
  return { filas: [...byId.values()], repetidos: repeated };
}

/**
 * What each row produces. A row feeds TWO things: a vocabulary
 * entry (palabra_es → palabra_dm) and an everyday sentence
 * (ejemplo_es → ejemplo_dm). Whatever is missing is not discarded: it stays as
 * pending for the speakers to fill in.
 */
export function planElicitation(rawRows: ElicitationRow[]): ElicitationPlan {
  const { filas: rows, repetidos: repeated } = mergeById(rawRows);
  const plan: ElicitationPlan = {
    vocabulario: [],
    oraciones: [],
    pruebas: [],
    pendientes: [],
    resueltas: [],
    idsRepetidos: repeated,
  };

  for (const row of rows) {
    const notes = [row.variante ? `variante: ${row.variante}` : '', row.notas]
      .filter(Boolean)
      .join(' · ');
    const complete = row.palabraDm.length > 0 && row.ejemploDm.length > 0;

    if (row.palabraEs && row.palabraDm) {
      plan.vocabulario.push({
        espanol: row.palabraEs,
        damana: row.palabraDm,
        categoria: row.ambito,
        notas: notes,
        fuente: ELICITATION_SOURCE,
      });
    }

    if (row.ejemploEs && row.ejemploDm) {
      if (isTestRow(row.id)) {
        plan.pruebas.push({
          espanol: row.ejemploEs,
          damanaEsperado: row.ejemploDm,
          ambito: row.ambito,
        });
      } else {
        plan.oraciones.push({
          idExterno: `elic_${row.id || normalize(row.palabraEs)}`,
          damana: row.ejemploDm,
          espanol: row.ejemploEs,
          fuente: ELICITATION_SOURCE,
        });
      }
    }

    if (row.palabraEs) {
      if (complete) plan.resueltas.push(row.palabraEs);
      else plan.pendientes.push({ palabra: row.palabraEs, contexto: row.ejemploEs });
    }
  }
  return plan;
}
