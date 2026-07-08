// Espejo de los DTOs del backend (backend/src/consulta y backend/src/srs).

export type Idioma = 'damana' | 'espanol';
export type FuenteCorpus = 'capitulos' | 'frases' | 'vocabulario';

export interface Concordancia {
  fuente: FuenteCorpus;
  id: number;
  referencia: string;
  fragmento: string;
  textoParalelo: string;
}

export interface RespuestaBusqueda {
  consulta: string;
  idioma: Idioma;
  total: number;
  resultados: Concordancia[];
}

export interface FrecuenciaFuente {
  fuente: FuenteCorpus;
  frecuencia: number;
}

export interface TraduccionCandidata {
  palabra: string;
  coocurrencias: number;
}

export interface FichaPalabra {
  palabra: string;
  frecuenciaTotal: number;
  frecuenciaPorFuente: FrecuenciaFuente[];
  concordancias: Concordancia[];
  traduccionesCandidatas: TraduccionCandidata[];
}

export interface Frecuencia {
  palabra: string;
  frecuencia: number;
}

export type Calificacion = 'otra_vez' | 'dificil' | 'bien' | 'facil';

export interface TarjetaSrs {
  palabra: string;
  tipo: 'vocabulario' | 'frecuencia';
  traduccion: string;
  repeticiones: number;
}

export interface EstadoSrs {
  tarjeta: TarjetaSrs | null;
  pendientes: number;
  nuevas: number;
}

export interface ProgresoActualizado {
  palabra: string;
  repeticiones: number;
  intervaloDias: number;
  proximaRevision: string;
}

export interface EntradaVocabulario {
  id: number;
  espanol: string;
  damana: string;
  notas: string | null;
}

export interface Frase {
  id: number;
  fuente: string;
  damana: string;
  espanol: string | null;
  notas: string | null;
}
