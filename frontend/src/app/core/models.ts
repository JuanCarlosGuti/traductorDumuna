// Mirror of the backend DTOs (backend/src/query, srs, traduccion and pendientes).

export type Language = 'damana' | 'espanol';
export type CorpusSource = 'oraciones' | 'frases' | 'vocabulario' | 'conjugaciones';
export type CorpusDomain = 'biblico' | 'cotidiano' | 'gramatica';

export interface Concordance {
  fuente: CorpusSource;
  id: number;
  referencia: string;
  fragmento: string;
  textoParalelo: string;
  puntaje: number | null;
}

export interface SearchResponse {
  consulta: string;
  idioma: Language;
  modo: 'concordancia' | 'similitud';
  total: number;
  resultados: Concordance[];
}

export interface SourceFrequency {
  fuente: CorpusSource;
  frecuencia: number;
}

export interface CandidateTranslation {
  palabra: string;
  coocurrencias: number;
}

export interface WordCardVocabularyEntry {
  espanol: string;
  categoria: string | null;
  notas: string | null;
  fuente: string | null;
}

export interface VerbForm {
  damana: string;
  espanol: string;
  lema: string;
}

export interface WordCard {
  palabra: string;
  entradasVocabulario: WordCardVocabularyEntry[];
  formasVerbales: VerbForm[];
  frecuenciaTotal: number;
  frecuenciaPorFuente: SourceFrequency[];
  concordancias: Concordance[];
  traduccionesCandidatas: CandidateTranslation[];
}

export interface Frequency {
  palabra: string;
  frecuencia: number;
  traduccion: string | null;
  categoria: string | null;
}

export interface Lemma {
  lema: string;
  formas: number;
}

export interface Conjugation {
  id: number;
  damana: string;
  espanol: string;
  lema: string;
  fuente: string | null;
  notas: string | null;
}

export interface ConjugationTable {
  lema: string;
  conjugaciones: Conjugation[];
}

export type Grade = 'otra_vez' | 'dificil' | 'bien' | 'facil';

export interface SrsCard {
  palabra: string;
  tipo: 'vocabulario' | 'frecuencia';
  traduccion: string;
  repeticiones: number;
}

export interface SrsStatus {
  tarjeta: SrsCard | null;
  pendientes: number;
  nuevas: number;
}

export interface UpdatedProgress {
  palabra: string;
  repeticiones: number;
  intervaloDias: number;
  proximaRevision: string;
}

export type TranslationDirection = 'damana_a_espanol' | 'espanol_a_damana';

export interface ExampleFragment {
  fuente: CorpusSource;
  dominio: CorpusDomain;
  referencia: string;
  damana: string;
  espanol: string;
  puntaje: number;
}

export type SupportLevel = 'bueno' | 'parcial' | 'revisar';

export interface Support {
  nivel: SupportLevel;
  motivos: string[];
}

export interface GlossPair {
  origen: string;
  destino: string;
}

export type MatchKind = 'exacta' | 'sin_tildes' | 'sinonimo' | 'singular' | 'frase' | 'posible';

export interface Sense {
  palabra: string;
  espanol: string;
  damana: string;
  categoria: string | null;
  coincidencia: MatchKind;
}

export interface UsedProperName {
  enTexto: string;
  espanol: string;
  damana: string;
}

export interface UsedRule {
  forma: string;
  significado: string | null;
  ejemplo: string | null;
  disparador: string | null;
}

export interface TranslationResponse {
  traduccion: string;
  glosa: GlossPair[];
  palabrasSinEquivalente: string[];
  reglasAplicadas: string[];
  confianza: number;
  explicacionBreve: string;
  apoyo: Support;
  ejemplos: ExampleFragment[];
  diccionario: Sense[];
  nombresPropios: UsedProperName[];
  reglas: UsedRule[];
  disparadores: string[];
}

export interface TranslatorStatus {
  disponible: boolean;
  proveedor: 'anthropic' | 'compatible' | null;
  modelo: string | null;
}

export type ValidationOrigin = 'confirmada' | 'corregida';

export interface ValidateTranslation {
  texto: string;
  direccion: TranslationDirection;
  traduccion: string;
  origen: ValidationOrigin;
  traduccionModelo?: string;
}

export interface SavedValidation {
  guardada: boolean;
  total: number;
}

export interface PendingItem {
  id: number;
  palabra: string;
  idioma: Language;
  contexto: string | null;
  vecesPedida: number;
  estado: 'pendiente' | 'exportada' | 'resuelta';
  origen: 'traductor' | 'elicitacion';
  creadoEn: string;
  actualizadoEn: string;
}

export interface VocabularyEntry {
  id: number;
  espanol: string;
  damana: string;
  categoria: string | null;
  notas: string | null;
  fuente: string | null;
}

export interface Phrase {
  id: number;
  fuente: string | null;
  damana: string;
  espanol: string | null;
  notas: string | null;
  dominio: CorpusDomain;
}
