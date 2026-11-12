// Mirror of the backend DTOs (backend/src/query, srs, traduccion and pendientes).

export type Language = 'damana' | 'espanol';
export type CorpusSource = 'oraciones' | 'frases' | 'vocabulario' | 'conjugaciones';
export type CorpusDomain = 'biblico' | 'cotidiano' | 'gramatica';

export interface Concordance {
  source: CorpusSource;
  id: number;
  reference: string;
  fragment: string;
  parallelText: string;
  score: number | null;
}

export interface SearchResponse {
  query: string;
  language: Language;
  mode: 'concordancia' | 'similitud';
  total: number;
  results: Concordance[];
}

export interface SourceFrequency {
  source: CorpusSource;
  frequency: number;
}

export interface CandidateTranslation {
  word: string;
  cooccurrences: number;
}

export interface WordCardVocabularyEntry {
  spanish: string;
  category: string | null;
  notes: string | null;
  source: string | null;
}

export interface VerbForm {
  damana: string;
  spanish: string;
  lemma: string;
}

export interface WordCard {
  word: string;
  vocabularyEntries: WordCardVocabularyEntry[];
  verbForms: VerbForm[];
  totalFrequency: number;
  frequencyBySource: SourceFrequency[];
  concordances: Concordance[];
  candidateTranslations: CandidateTranslation[];
}

export interface Frequency {
  word: string;
  frequency: number;
  translation: string | null;
  category: string | null;
}

export interface Lemma {
  lemma: string;
  forms: number;
}

export interface Conjugation {
  id: number;
  damana: string;
  spanish: string;
  lemma: string;
  source: string | null;
  notes: string | null;
}

export interface ConjugationTable {
  lemma: string;
  conjugations: Conjugation[];
}

export type Grade = 'otra_vez' | 'dificil' | 'bien' | 'facil';

export interface SrsCard {
  word: string;
  type: 'vocabulario' | 'frecuencia';
  translation: string;
  repetitions: number;
}

export interface SrsStatus {
  card: SrsCard | null;
  pendingCards: number;
  newCards: number;
}

export interface UpdatedProgress {
  word: string;
  repetitions: number;
  intervalDays: number;
  nextReview: string;
}

export type TranslationDirection = 'damana_a_espanol' | 'espanol_a_damana';

export interface ExampleFragment {
  source: CorpusSource;
  domain: CorpusDomain;
  reference: string;
  damana: string;
  spanish: string;
  score: number;
}

export type SupportLevel = 'bueno' | 'parcial' | 'revisar';

export interface Support {
  level: SupportLevel;
  reasons: string[];
}

export interface GlossPair {
  origin: string;
  target: string;
}

export type MatchKind = 'exacta' | 'sin_tildes' | 'sinonimo' | 'singular' | 'frase' | 'posible';

export interface Sense {
  word: string;
  spanish: string;
  damana: string;
  category: string | null;
  match: MatchKind;
}

export interface UsedProperName {
  inText: string;
  spanish: string;
  damana: string;
}

export interface UsedRule {
  form: string;
  meaning: string | null;
  example: string | null;
  trigger: string | null;
}

export interface TranslationResponse {
  translation: string;
  gloss: GlossPair[];
  wordsWithoutEquivalent: string[];
  appliedRules: string[];
  confidence: number;
  briefExplanation: string;
  support: Support;
  examples: ExampleFragment[];
  dictionary: Sense[];
  properNames: UsedProperName[];
  rules: UsedRule[];
  triggers: string[];
}

export interface TranslatorStatus {
  available: boolean;
  provider: 'anthropic' | 'compatible' | null;
  model: string | null;
}

export type ValidationOrigin = 'confirmada' | 'corregida';

export interface ValidateTranslation {
  text: string;
  direction: TranslationDirection;
  translation: string;
  origin: ValidationOrigin;
  modelTranslation?: string;
}

export interface SavedValidation {
  saved: boolean;
  total: number;
}

export interface PendingItem {
  id: number;
  word: string;
  language: Language;
  context: string | null;
  timesRequested: number;
  status: 'pendiente' | 'exportada' | 'resuelta';
  origin: 'traductor' | 'elicitacion';
  createdAt: string;
  updatedAt: string;
}

export interface VocabularyEntry {
  id: number;
  spanish: string;
  damana: string;
  category: string | null;
  notes: string | null;
  source: string | null;
}

export interface Phrase {
  id: number;
  source: string | null;
  damana: string;
  spanish: string | null;
  notes: string | null;
  domain: CorpusDomain;
}
