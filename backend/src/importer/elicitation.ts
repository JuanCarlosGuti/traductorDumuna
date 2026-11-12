import { normalize } from '../common/text/normalizer';
import { normalizeWrittenDamana } from '../common/text/spelling';

/** Row of the elicitation format («elicitacion» sheet), already cleaned. */
export interface ElicitationRow {
  id: string;
  scope: string;
  wordEs: string;
  wordDm: string;
  exampleEs: string;
  exampleDm: string;
  variant: string;
  notes: string;
  /** File it came from (for traceability). */
  file: string;
}

export interface ElicitedVocabulary {
  spanish: string;
  damana: string;
  category: string;
  notes: string;
  source: string;
}

export interface ElicitedSentence {
  externalId: string;
  damana: string;
  spanish: string;
  source: string;
}

export interface TranslationTest {
  spanish: string;
  expectedDamana: string;
  scope: string;
}

export interface ElicitationPendingItem {
  word: string;
  context: string;
}

export interface ElicitationPlan {
  vocabulary: ElicitedVocabulary[];
  sentences: ElicitedSentence[];
  tests: TranslationTest[];
  pending: ElicitationPendingItem[];
  /** Words that arrived complete: they close their pending item if there was one. */
  resolved: string[];
  /** ids repeated across files: the last occurrence was kept. */
  repeatedIds: number;
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
    scope: (raw['ambito'] ?? '').trim().toLowerCase() || 'otro',
    wordEs: wordEs,
    wordDm: normalizeWrittenDamana((raw['palabra_dm'] ?? '').trim()),
    exampleEs: (raw['ejemplo_es'] ?? '').trim(),
    exampleDm: normalizeWrittenDamana((raw['ejemplo_dm'] ?? '').trim()),
    variant: (raw['variante'] ?? '').trim().toLowerCase(),
    notes: (raw['notas'] ?? '').trim(),
    file: file,
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
    const key = row.id || `sin-id:${normalize(row.wordEs)}`;
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
    vocabulary: [],
    sentences: [],
    tests: [],
    pending: [],
    resolved: [],
    repeatedIds: repeated,
  };

  for (const row of rows) {
    const notes = [row.variant ? `variante: ${row.variant}` : '', row.notes]
      .filter(Boolean)
      .join(' · ');
    const complete = row.wordDm.length > 0 && row.exampleDm.length > 0;

    if (row.wordEs && row.wordDm) {
      plan.vocabulary.push({
        spanish: row.wordEs,
        damana: row.wordDm,
        category: row.scope,
        notes: notes,
        source: ELICITATION_SOURCE,
      });
    }

    if (row.exampleEs && row.exampleDm) {
      if (isTestRow(row.id)) {
        plan.tests.push({
          spanish: row.exampleEs,
          expectedDamana: row.exampleDm,
          scope: row.scope,
        });
      } else {
        plan.sentences.push({
          externalId: `elic_${row.id || normalize(row.wordEs)}`,
          damana: row.exampleDm,
          spanish: row.exampleEs,
          source: ELICITATION_SOURCE,
        });
      }
    }

    if (row.wordEs) {
      if (complete) plan.resolved.push(row.wordEs);
      else plan.pending.push({ word: row.wordEs, context: row.exampleEs });
    }
  }
  return plan;
}
