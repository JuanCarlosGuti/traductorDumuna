// Espejo de los DTOs del backend (backend/src/consulta y backend/src/srs).

export type Idioma = 'damana' | 'espanol';
export type FuenteCorpus = 'oraciones' | 'frases' | 'vocabulario' | 'conjugaciones';

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
  categoria: string | null;
}

export interface Lema {
  lema: string;
  formas: number;
}

export interface Conjugacion {
  id: number;
  damana: string;
  espanol: string;
  lema: string;
  fuente: string | null;
  notas: string | null;
}

export interface TablaConjugacion {
  lema: string;
  conjugaciones: Conjugacion[];
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

export type DireccionTraduccion = 'damana_a_espanol' | 'espanol_a_damana';

export interface FragmentoEjemplo {
  fuente: FuenteCorpus;
  referencia: string;
  damana: string;
  espanol: string;
  puntaje: number;
}

export interface RespuestaTraduccion {
  traduccion: string;
  palabrasDudosas: string[];
  explicacionBreve: string;
  ejemplos: FragmentoEjemplo[];
  vocabularioUsado: { espanol: string; damana: string }[];
}

export interface EstadoTraductor {
  disponible: boolean;
  proveedor: 'anthropic' | 'compatible' | null;
  modelo: string | null;
}

export interface EntradaVocabulario {
  id: number;
  espanol: string;
  damana: string;
  categoria: string | null;
  notas: string | null;
  fuente: string | null;
}

export interface Frase {
  id: number;
  fuente: string | null;
  damana: string;
  espanol: string | null;
  notas: string | null;
}
