import { normalizar } from '../comun/texto/normalizador';
import { normalizarDamanaEscrito } from '../comun/texto/ortografia';

/** Fila del formato de elicitación (hoja «elicitacion»), ya limpia. */
export interface FilaElicitacion {
  id: string;
  ambito: string;
  palabraEs: string;
  palabraDm: string;
  ejemploEs: string;
  ejemploDm: string;
  variante: string;
  notas: string;
  /** Archivo del que salió (para trazabilidad). */
  archivo: string;
}

export interface VocabularioElicitado {
  espanol: string;
  damana: string;
  categoria: string;
  notas: string;
  fuente: string;
}

export interface OracionElicitada {
  idExterno: string;
  damana: string;
  espanol: string;
  fuente: string;
}

export interface PruebaTraduccion {
  espanol: string;
  damanaEsperado: string;
  ambito: string;
}

export interface PendienteElicitacion {
  palabra: string;
  contexto: string;
}

export interface PlanElicitacion {
  vocabulario: VocabularioElicitado[];
  oraciones: OracionElicitada[];
  pruebas: PruebaTraduccion[];
  pendientes: PendienteElicitacion[];
  /** Palabras que llegaron completas: cierran su pendiente si lo había. */
  resueltas: string[];
  /** ids repetidos entre archivos: se quedó la última aparición. */
  idsRepetidos: number;
}

export const FUENTE_ELICITACION = 'elicitacion';

/** Una de cada PROPORCION_PRUEBA filas completas se reserva para evaluar. */
export const PROPORCION_PRUEBA = 10;

/**
 * Hash FNV-1a de 32 bits: estable entre ejecuciones y plataformas. Se usa
 * en vez de «cada décima fila» para que una fila reservada como prueba
 * siga siéndolo aunque lleguen más lotes o cambie el orden: si la
 * reserva se moviera, una prueba de ayer sería ejemplo de retrieval hoy y
 * la evaluación dejaría de ser comparable entre versiones.
 */
export function hashEstable(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function esFilaDePrueba(id: string): boolean {
  return hashEstable(id.trim()) % PROPORCION_PRUEBA === 0;
}

/** Convierte una fila cruda (encabezados normalizados) en FilaElicitacion. */
export function interpretarFila(
  cruda: Record<string, string>,
  archivo: string,
): FilaElicitacion | null {
  const id = (cruda['id'] ?? '').trim();
  const palabraEs = (cruda['palabra_es'] ?? '').trim();
  if (!id && !palabraEs) return null;
  return {
    id,
    ambito: (cruda['ambito'] ?? '').trim().toLowerCase() || 'otro',
    palabraEs,
    palabraDm: normalizarDamanaEscrito((cruda['palabra_dm'] ?? '').trim()),
    ejemploEs: (cruda['ejemplo_es'] ?? '').trim(),
    ejemploDm: normalizarDamanaEscrito((cruda['ejemplo_dm'] ?? '').trim()),
    variante: (cruda['variante'] ?? '').trim().toLowerCase(),
    notas: (cruda['notas'] ?? '').trim(),
    archivo,
  };
}

/**
 * Funde varios lotes en uno: el id manda (idempotente por id), y si un id
 * aparece en más de un archivo gana el último en orden alfabético de
 * archivo, que es el más reciente por convención de nombre.
 */
export function fundirPorId(filas: FilaElicitacion[]): {
  filas: FilaElicitacion[];
  repetidos: number;
} {
  const porId = new Map<string, FilaElicitacion>();
  let repetidos = 0;
  for (const fila of filas) {
    const clave = fila.id || `sin-id:${normalizar(fila.palabraEs)}`;
    if (porId.has(clave)) repetidos++;
    porId.set(clave, fila);
  }
  return { filas: [...porId.values()], repetidos };
}

/**
 * Qué produce cada fila. Una fila alimenta DOS cosas: una entrada de
 * vocabulario (palabra_es → palabra_dm) y una oración cotidiana
 * (ejemplo_es → ejemplo_dm). Lo que falte no se descarta: queda como
 * pendiente para que las hablantes lo llenen.
 */
export function planificarElicitacion(filasCrudas: FilaElicitacion[]): PlanElicitacion {
  const { filas, repetidos } = fundirPorId(filasCrudas);
  const plan: PlanElicitacion = {
    vocabulario: [],
    oraciones: [],
    pruebas: [],
    pendientes: [],
    resueltas: [],
    idsRepetidos: repetidos,
  };

  for (const fila of filas) {
    const notas = [fila.variante ? `variante: ${fila.variante}` : '', fila.notas]
      .filter(Boolean)
      .join(' · ');
    const completa = fila.palabraDm.length > 0 && fila.ejemploDm.length > 0;

    if (fila.palabraEs && fila.palabraDm) {
      plan.vocabulario.push({
        espanol: fila.palabraEs,
        damana: fila.palabraDm,
        categoria: fila.ambito,
        notas,
        fuente: FUENTE_ELICITACION,
      });
    }

    if (fila.ejemploEs && fila.ejemploDm) {
      if (esFilaDePrueba(fila.id)) {
        plan.pruebas.push({
          espanol: fila.ejemploEs,
          damanaEsperado: fila.ejemploDm,
          ambito: fila.ambito,
        });
      } else {
        plan.oraciones.push({
          idExterno: `elic_${fila.id || normalizar(fila.palabraEs)}`,
          damana: fila.ejemploDm,
          espanol: fila.ejemploEs,
          fuente: FUENTE_ELICITACION,
        });
      }
    }

    if (fila.palabraEs) {
      if (completa) plan.resueltas.push(fila.palabraEs);
      else plan.pendientes.push({ palabra: fila.palabraEs, contexto: fila.ejemploEs });
    }
  }
  return plan;
}
