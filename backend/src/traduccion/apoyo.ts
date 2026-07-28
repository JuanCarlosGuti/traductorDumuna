import { FuenteCorpus } from '../consulta/consulta.enums';

export type NivelApoyo = 'bueno' | 'parcial' | 'revisar';

/**
 * Umbrales sobre la MEDIA de los K puntajes del retrieval. El puntaje del
 * mejor ejemplo (top) engaña —puede venir de una entrada de diccionario que
 * contiene la palabra literal— mientras que la media refleja cuánto contexto
 * real respalda la traducción.
 *
 * Calibrados sobre 42 consultas del corpus (jul 2026):
 *   cubierto    mediana 0,280 (rango 0,247-0,387)
 *   descubierto mediana 0,187 (rango 0,099-0,302)
 * Con 0,20 se detecta el 55% de los descubiertos SIN falsos positivos; subir
 * a 0,30 detectaría el 95% pero marcaría el 70% de los buenos, y un aviso que
 * salta siempre se acaba ignorando.
 *
 * Los niveles se derivan al vuelo de lo registrado en `traducciones`, no se
 * guardan: así, recalibrar estos umbrales reinterpreta también el histórico.
 */
export const UMBRAL_REVISAR = 0.2;
export const UMBRAL_BUENO = 0.32;

export interface SenalesApoyo {
  puntajeMedio: number;
  fuenteTop: FuenteCorpus | null;
  ejemplosRecuperados: number;
}

export interface Apoyo {
  nivel: NivelApoyo;
  /** Razones por las que se marcó «revisar»; vacío en los demás niveles. */
  motivos: string[];
}

export function evaluarApoyo(senales: SenalesApoyo): Apoyo {
  const motivos: string[] = [];

  if (senales.ejemplosRecuperados === 0) {
    motivos.push('sin_ejemplos');
  }
  if (senales.puntajeMedio < UMBRAL_REVISAR) {
    motivos.push('similitud_baja');
  }
  // El mejor match es una entrada de la tabla de conjugaciones: confirma la
  // forma verbal, pero no aporta un uso real en contexto. (El vocabulario no
  // participa en el retrieval; va aparte en el prompt.)
  if (senales.fuenteTop === FuenteCorpus.conjugaciones) {
    motivos.push('apoyo_solo_de_diccionario');
  }

  if (motivos.length > 0) return { nivel: 'revisar', motivos };
  if (senales.puntajeMedio < UMBRAL_BUENO) return { nivel: 'parcial', motivos: [] };
  return { nivel: 'bueno', motivos: [] };
}
