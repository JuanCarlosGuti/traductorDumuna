import { normalizar } from '../comun/texto/normalizador';
import { normalizarDamanaEscrito } from '../comun/texto/ortografia';

/** Row of the elicitation format («elicitacion» sheet), already cleaned. */
export interface FilaElicitacion {
  id: string;
  ambito: string;
  palabraEs: string;
  palabraDm: string;
  ejemploEs: string;
  ejemploDm: string;
  variante: string;
  notas: string;
  /** File it came from (for traceability). */
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
  /** Words that arrived complete: they close their pending item if there was one. */
  resueltas: string[];
  /** ids repeated across files: the last occurrence was kept. */
  idsRepetidos: number;
}

export const FUENTE_ELICITACION = 'elicitacion';

/** One in every PROPORCION_PRUEBA complete rows is reserved for evaluation. */
export const PROPORCION_PRUEBA = 10;

/**
 * 32-bit FNV-1a hash: stable across runs and platforms. It is used
 * instead of «every tenth row» so that a row reserved as a test
 * stays one even if more batches arrive or the order changes: if the
 * reservation moved, yesterday's test would be a retrieval example today and
 * the evaluation would stop being comparable across versions.
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

/** Converts a raw row (normalized headers) into a FilaElicitacion. */
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
 * Merges several batches into one: the id rules (idempotent by id), and if an id
 * appears in more than one file the last one in alphabetical file
 * order wins, which is the most recent by naming convention.
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
 * What each row produces. A row feeds TWO things: a vocabulary
 * entry (palabra_es → palabra_dm) and an everyday sentence
 * (ejemplo_es → ejemplo_dm). Whatever is missing is not discarded: it stays as
 * pending for the speakers to fill in.
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
