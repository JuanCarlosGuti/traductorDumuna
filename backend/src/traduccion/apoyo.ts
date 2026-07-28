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
  /**
   * Ejemplos que vienen de oraciones o frases, o sea, de la lengua en uso.
   * `null` en las traducciones registradas antes de medirlo (v5): entonces
   * se recae en la heurística vieja del top-1.
   */
  ejemplosEnContexto?: number | null;
}

export interface Apoyo {
  nivel: NivelApoyo;
  /** Razones por las que se marcó «revisar»; vacío en los demás niveles. */
  motivos: string[];
}

/**
 * ¿Ningún ejemplo muestra la lengua en uso? Con la señal medida basta
 * contarla; en los registros viejos, que no la tienen, se conserva la
 * heurística original para no reinterpretar el histórico a ciegas.
 */
function sinContexto(senales: SenalesApoyo): boolean {
  return senales.ejemplosEnContexto == null
    ? senales.fuenteTop === FuenteCorpus.conjugaciones
    : senales.ejemplosEnContexto === 0 && senales.ejemplosRecuperados > 0;
}

export function evaluarApoyo(senales: SenalesApoyo): Apoyo {
  const motivos: string[] = [];

  if (senales.ejemplosRecuperados === 0) {
    motivos.push('sin_ejemplos');
  }
  if (senales.puntajeMedio < UMBRAL_REVISAR) {
    motivos.push('similitud_baja');
  }
  // Todo el apoyo son entradas de la tabla de conjugaciones: confirman la
  // forma verbal, pero ninguna muestra un uso real. (El vocabulario no
  // participa en el retrieval; va aparte en el prompt.)
  //
  // Se cuenta el contexto en vez de mirar solo el top-1: desde que el
  // retrieval expande por raíz verbal, una consulta como «naijkasheshisha»
  // encabeza con su propia conjugación (coincidencia exacta) pero trae
  // debajo seis oraciones y frases con el verbo. Ahí el apoyo NO es solo de
  // diccionario, y el aviso viejo mentía.
  if (sinContexto(senales)) {
    motivos.push('apoyo_solo_de_diccionario');
  }

  if (motivos.length > 0) return { nivel: 'revisar', motivos };
  if (senales.puntajeMedio < UMBRAL_BUENO) return { nivel: 'parcial', motivos: [] };
  return { nivel: 'bueno', motivos: [] };
}
