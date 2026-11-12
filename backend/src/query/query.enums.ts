export enum Language {
  damana = 'damana',
  espanol = 'espanol',
}

export enum CorpusSource {
  oraciones = 'oraciones',
  frases = 'frases',
  vocabulario = 'vocabulario',
  conjugaciones = 'conjugaciones',
}

/**
 * Which language register an example comes from. The biblical corpus (lfb) is
 * the main source of grammar and morphology, but everyday
 * examples (elicitation with speakers, phrases from meetings) take priority
 * when available; conjugations are the «grammar» domain.
 */
export enum CorpusDomain {
  biblico = 'biblico',
  cotidiano = 'cotidiano',
  gramatica = 'gramatica',
}
