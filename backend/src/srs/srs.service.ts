import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { FrecuenciasService } from '../consulta/frecuencias.service';
import { PalabraService } from '../consulta/palabra.service';
import { CorpusRepository } from '../consulta/corpus.repository';
import { CONEXION_DB } from '../database/database.constants';
import {
  EstadoSrsDto,
  ProgresoActualizadoDto,
  TarjetaSrsDto,
} from './dto/srs.dto';
import { aplicarSm2, Calificacion, ESTADO_SM2_INICIAL, EstadoSm2 } from './sm2';

const TOP_FRECUENCIAS = 300;
const MAX_CANDIDATAS_TARJETA = 3;

interface CartaPool {
  palabra: string;
  tipo: 'vocabulario' | 'frecuencia';
  traduccion?: string;
}

interface FilaProgreso {
  palabra: string;
  repeticiones: number;
  factor_facilidad: number;
  intervalo_dias: number;
  proxima_revision: string;
}

@Injectable()
export class SrsService {
  constructor(
    @Inject(CONEXION_DB) private readonly db: Database,
    private readonly repo: CorpusRepository,
    private readonly frecuencias: FrecuenciasService,
    private readonly palabraService: PalabraService,
  ) {}

  /**
   * Próxima tarjeta a repasar: primero las vencidas (proxima_revision más
   * antigua), después las nunca vistas (vocabulario primero, luego las
   * TOP_FRECUENCIAS palabras más frecuentes por orden de frecuencia).
   */
  siguiente(ahora: Date = new Date()): EstadoSrsDto {
    const pool = this.pool();
    const progresos = this.progresosPorPalabra();

    const vencidas = pool
      .filter((c) => {
        const p = progresos.get(c.palabra);
        return p !== undefined && p.proxima_revision <= ahora.toISOString();
      })
      .sort((a, b) =>
        progresos
          .get(a.palabra)!
          .proxima_revision.localeCompare(progresos.get(b.palabra)!.proxima_revision),
      );
    const nuevas = pool.filter((c) => !progresos.has(c.palabra));

    const carta = vencidas[0] ?? nuevas[0] ?? null;
    return {
      tarjeta: carta ? this.armarTarjeta(carta, progresos.get(carta.palabra)) : null,
      pendientes: vencidas.length,
      nuevas: nuevas.length,
    };
  }

  responder(
    palabra: string,
    calificacion: Calificacion,
    ahora: Date = new Date(),
  ): ProgresoActualizadoDto {
    if (!this.pool().some((c) => c.palabra === palabra)) {
      throw new NotFoundException(
        `La palabra "${palabra}" no está en el mazo de repaso`,
      );
    }

    const fila = this.db
      .prepare('SELECT * FROM progreso_srs WHERE palabra = ?')
      .get(palabra) as FilaProgreso | undefined;
    const estado: EstadoSm2 = fila
      ? {
          repeticiones: fila.repeticiones,
          factorFacilidad: fila.factor_facilidad,
          intervaloDias: fila.intervalo_dias,
        }
      : ESTADO_SM2_INICIAL;

    const nuevo = aplicarSm2(estado, calificacion);
    const proxima = new Date(
      ahora.getTime() + nuevo.intervaloDias * 24 * 60 * 60 * 1000,
    ).toISOString();

    this.db
      .prepare(
        `INSERT INTO progreso_srs
           (palabra, repeticiones, factor_facilidad, intervalo_dias, proxima_revision, actualizado_en)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(palabra) DO UPDATE SET
           repeticiones = excluded.repeticiones,
           factor_facilidad = excluded.factor_facilidad,
           intervalo_dias = excluded.intervalo_dias,
           proxima_revision = excluded.proxima_revision,
           actualizado_en = excluded.actualizado_en`,
      )
      .run(
        palabra,
        nuevo.repeticiones,
        nuevo.factorFacilidad,
        nuevo.intervaloDias,
        proxima,
        ahora.toISOString(),
      );

    return {
      palabra,
      repeticiones: nuevo.repeticiones,
      intervaloDias: nuevo.intervaloDias,
      proximaRevision: proxima,
    };
  }

  /** Mazo: todo el vocabulario + las 300 palabras más frecuentes (sin duplicar). */
  private pool(): CartaPool[] {
    const vocabulario: CartaPool[] = this.repo.listarVocabulario().map((v) => ({
      palabra: v.damana,
      tipo: 'vocabulario',
      traduccion: v.espanol,
    }));
    const enVocabulario = new Set(vocabulario.map((c) => c.palabra));
    const frecuentes: CartaPool[] = this.frecuencias
      .listar(TOP_FRECUENCIAS)
      .filter((f) => !enVocabulario.has(f.palabra))
      .map((f) => ({ palabra: f.palabra, tipo: 'frecuencia' }));
    return [...vocabulario, ...frecuentes];
  }

  private progresosPorPalabra(): Map<string, FilaProgreso> {
    const filas = this.db
      .prepare('SELECT * FROM progreso_srs')
      .all() as FilaProgreso[];
    return new Map(filas.map((f) => [f.palabra, f]));
  }

  private armarTarjeta(carta: CartaPool, progreso?: FilaProgreso): TarjetaSrsDto {
    let traduccion = carta.traduccion;
    if (traduccion === undefined) {
      // Palabra frecuente sin entrada de vocabulario: el reverso son sus
      // traducciones candidatas por co-ocurrencia.
      const candidatas = this.palabraService
        .ficha(carta.palabra)
        .traduccionesCandidatas.slice(0, MAX_CANDIDATAS_TARJETA)
        .map((c) => c.palabra);
      traduccion =
        candidatas.length > 0
          ? `candidatas: ${candidatas.join(', ')}`
          : '(sin traducciones candidatas)';
    }
    return {
      palabra: carta.palabra,
      tipo: carta.tipo,
      traduccion,
      repeticiones: progreso?.repeticiones ?? 0,
    };
  }
}
