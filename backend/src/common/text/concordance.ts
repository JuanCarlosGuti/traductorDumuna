import { normalize } from './normalizer';

export interface Occurrence {
  start: number;
  end: number;
  word: string;
}

const RE_WORD = /[\p{L}ʉ']+/gu;

/**
 * Finds every occurrence of a word in a text, comparing
 * in normalized form (no accents or capitals, keeping ʉ and ñ).
 * Indexes refer to the original text. Edge apostrophes are
 * trimmed the same way as in tokenizeDamana.
 */
export function findOccurrences(text: string, queryText: string): Occurrence[] {
  const goal = normalize(queryText.trim());
  if (goal.length === 0) return [];

  const occurrences: Occurrence[] = [];
  for (const m of text.matchAll(RE_WORD)) {
    const rawValue = m[0];
    const withoutLeft = rawValue.replace(/^'+/, '');
    const word = withoutLeft.replace(/'+$/, '');
    if (word.length === 0) continue;
    const start = (m.index ?? 0) + (rawValue.length - withoutLeft.length);
    if (normalize(word) === goal) {
      occurrences.push({ start: start, end: start + word.length, word: word });
    }
  }
  return occurrences;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cleanSpaces(s: string): string {
  return s.replace(/\s+/g, ' ');
}

/**
 * Marks ALL the given occurrences in a full text with <mark>,
 * escaping the rest as HTML and collapsing line breaks. Meant
 * for short texts (sentences, phrases) where there is no need to trim
 * context. Overlapping occurrences are ignored.
 */
export function markOccurrences(text: string, occurrences: Occurrence[]): string {
  const sortedWords = [...occurrences].sort((a, b) => a.start - b.start);
  let result = '';
  let position = 0;
  for (const oc of sortedWords) {
    if (oc.start < position) continue;
    result += escapeHtml(cleanSpaces(text.slice(position, oc.start)));
    result += '<mark>' + escapeHtml(text.slice(oc.start, oc.end)) + '</mark>';
    position = oc.end;
  }
  result += escapeHtml(cleanSpaces(text.slice(position)));
  return result;
}

/**
 * Extracts the context fragment for an occurrence: ±radio characters on
 * each side, cutting at a word boundary (never mid-word), with the
 * matched word wrapped in <mark>. Cuts are signalled with «…»
 * and internal line breaks are collapsed to a space. The rest of the
 * fragment is HTML-escaped.
 */
export function extractFragment(
  text: string,
  occurrence: Occurrence,
  radio = 120,
): string {
  let ini = Math.max(0, occurrence.start - radio);
  if (ini > 0 && !/\s/.test(text[ini - 1])) {
    const firstSpace = text.slice(ini, occurrence.start).search(/\s/);
    ini = firstSpace === -1 ? ini : ini + firstSpace + 1;
  }

  let end = Math.min(text.length, occurrence.end + radio);
  if (end < text.length && !/\s/.test(text[end])) {
    const tail = text.slice(occurrence.end, end);
    const lastSpace = tail.search(/\s\S*$/);
    end = lastSpace === -1 ? end : occurrence.end + lastSpace;
  }

  const before = cleanSpaces(text.slice(ini, occurrence.start));
  const word = text.slice(occurrence.start, occurrence.end);
  const after = cleanSpaces(text.slice(occurrence.end, end));

  return (
    (ini > 0 ? '…' : '') +
    escapeHtml(before) +
    '<mark>' +
    escapeHtml(word) +
    '</mark>' +
    escapeHtml(after) +
    (end < text.length ? '…' : '')
  );
}
