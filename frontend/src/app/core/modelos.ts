// Espejo de los DTOs del backend (backend/src/consulta, srs, traduccion y pendientes).

export type Idioma = 'damana' | 'espanol';
export type FuenteCorpus = 'oraciones' | 'frases' | 'vocabulario' | 'conjugaciones';
export type DominioCorpus = 'biblico' | 'cotidiano' | 'gramatica';

export interface Concordancia {
  fuente: FuenteCorpus;
  id: number;
  referencia: string;
  fragmento: string;
  textoParalelo: string;
  puntaje: number | null;
}

export interface RespuestaBusqueda {
  consulta: string;
  idioma: Idioma;
  modo: 'concordancia' | 'similitud';
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

export interface EntradaVocabularioFicha {
  espanol: string;
  categoria: string | null;
  notas: string | null;
  fuente: string | null;
}

export interface FormaVerbal {
  damana: string;
  espanol: string;
  lema: string;
}

export interface FichaPalabra {
  palabra: string;
  entradasVocabulario: EntradaVocabularioFicha[];
  formasVerbales: FormaVerbal[];
  frecuenciaTotal: number;
  frecuenciaPorFuente: FrecuenciaFuente[];
  concordancias: Concordancia[];
  traduccionesCandidatas: TraduccionCandidata[];
}

export interface Frecuencia {
  palabra: string;
  frecuencia: number;
  traduccion: string | null;
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
  dominio: DominioCorpus;
  referencia: string;
  damana: string;
  espanol: string;
  puntaje: number;
}

export type NivelApoyo = 'bueno' | 'parcial' | 'revisar';

export interface Apoyo {
  nivel: NivelApoyo;
  motivos: string[];
}

export interface ParGlosa {
  origen: string;
  destino: string;
}

export type TipoCoincidencia = 'exacta' | 'sin_tildes' | 'sinonimo' | 'singular' | 'frase' | 'posible';

export interface Acepcion {
  palabra: string;
  espanol: string;
  damana: string;
  categoria: string | null;
  coincidencia: TipoCoincidencia;
}

export interface NombrePropioUsado {
  enTexto: string;
  espanol: string;
  damana: string;
}

export interface ReglaUsada {
  forma: string;
  significado: string | null;
  ejemplo: string | null;
  disparador: string | null;
}

export interface RespuestaTraduccion {
  traduccion: string;
  glosa: ParGlosa[];
  palabrasSinEquivalente: string[];
  reglasAplicadas: string[];
  confianza: number;
  explicacionBreve: string;
  apoyo: Apoyo;
  ejemplos: FragmentoEjemplo[];
  diccionario: Acepcion[];
  nombresPropios: NombrePropioUsado[];
  reglas: ReglaUsada[];
  disparadores: string[];
}

export interface EstadoTraductor {
  disponible: boolean;
  proveedor: 'anthropic' | 'compatible' | null;
  modelo: string | null;
}

export type OrigenValidacion = 'confirmada' | 'corregida';

export interface ValidarTraduccion {
  texto: string;
  direccion: DireccionTraduccion;
  traduccion: string;
  origen: OrigenValidacion;
  traduccionModelo?: string;
}

export interface ValidacionGuardada {
  guardada: boolean;
  total: number;
}

export interface Pendiente {
  id: number;
  palabra: string;
  idioma: Idioma;
  contexto: string | null;
  vecesPedida: number;
  estado: 'pendiente' | 'exportada' | 'resuelta';
  origen: 'traductor' | 'elicitacion';
  creadoEn: string;
  actualizadoEn: string;
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
  dominio: DominioCorpus;
}
