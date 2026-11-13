/**
 * Spanish display labels for the English enum values the API returns.
 * The code and the API speak English; the people using the app read Spanish,
 * so any enum value shown on screen goes through `label()`.
 */
export const LABELS: Record<string, string> = {
  // corpus sources
  sentences: 'oraciones',
  phrases: 'frases',
  vocabulary: 'vocabulario',
  conjugations: 'conjugaciones',
  // dictionary match kinds
  exact: 'exacta',
  no_accents: 'sin tildes',
  synonym: 'sinónimo',
  singular: 'singular',
  phrase: 'frase',
  possible: 'posible',
  // grammar rule triggers
  plural: 'plural',
  possessive: 'posesivo',
  negation: 'negación',
  question: 'pregunta',
  past: 'pasado',
  future: 'futuro',
  // pending items
  pending: 'pendiente',
  exported: 'exportada',
  resolved: 'resuelta',
  translator: 'traductor',
  elicitation: 'elicitación',
};

export function label(value: string | null | undefined): string {
  if (value == null) return '';
  return LABELS[value] ?? value;
}
