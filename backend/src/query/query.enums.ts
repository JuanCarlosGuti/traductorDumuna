export enum Language {
  damana = 'damana',
  spanish = 'spanish',
}

export enum CorpusSource {
  sentences = 'sentences',
  phrases = 'phrases',
  vocabulary = 'vocabulary',
  conjugations = 'conjugations',
}

/**
 * Which language register an example comes from. The biblical corpus (lfb) is
 * the main source of grammar and morphology, but everyday
 * examples (elicitation with speakers, phrases from meetings) take priority
 * when available; conjugations are the «grammar» domain.
 */
export enum CorpusDomain {
  biblical = 'biblical',
  everyday = 'everyday',
  grammar = 'grammar',
}
