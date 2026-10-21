export enum Idioma {
  damana = 'damana',
  espanol = 'espanol',
}

export enum FuenteCorpus {
  oraciones = 'oraciones',
  frases = 'frases',
  vocabulario = 'vocabulario',
  conjugaciones = 'conjugaciones',
}

/**
 * De qué registro de lengua viene un ejemplo. El corpus bíblico (lfb) es
 * la fuente principal de gramática y morfología, pero los ejemplos
 * cotidianos (elicitación con hablantes, frases de reuniones) mandan
 * cuando los hay; las conjugaciones son el dominio «gramática».
 */
export enum DominioCorpus {
  biblico = 'biblico',
  cotidiano = 'cotidiano',
  gramatica = 'gramatica',
}
