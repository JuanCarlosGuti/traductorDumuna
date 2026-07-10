import { Inject, Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { CONEXION_DB } from '../database/database.constants';
import { FuenteCorpus } from './consulta.enums';
import { ConjugacionDto, FraseDto, LemaDto, VocabularioDto } from './dto/consulta.dto';

export interface FilaTexto {
  id: number;
  referencia: string;
  textoDamana: string;
  textoEspanol: string;
  /** Solo oraciones: 'aprobado' | 'revisar' (calidad de la alineación). */
  estado?: string;
}

export interface FrecuenciaPalabra {
  palabra: string;
  frecuencia: number;
  originales: string[];
}

@Injectable()
export class CorpusRepository {
  constructor(@Inject(CONEXION_DB) private readonly db: Database) {}

  listarVocabulario(): VocabularioDto[] {
    return this.db
      .prepare(
        'SELECT rowid AS id, espanol, damana, categoria, notas, fuente FROM vocabulario ORDER BY rowid',
      )
      .all() as VocabularioDto[];
  }

  listarFrases(): FraseDto[] {
    return this.db
      .prepare('SELECT rowid AS id, fuente, damana, espanol, notas FROM frases ORDER BY rowid')
      .all() as FraseDto[];
  }

  /** Lemas verbales con su número de formas conjugadas. */
  listarLemas(): LemaDto[] {
    return this.db
      .prepare(
        'SELECT lema, COUNT(*) AS formas FROM conjugaciones GROUP BY lema ORDER BY lema',
      )
      .all() as LemaDto[];
  }

  /** Conjugaciones en cuya forma damana aparece la palabra (vía tokens). */
  conjugacionesConPalabra(palabraNormalizada: string): ConjugacionDto[] {
    return this.db
      .prepare(
        `SELECT DISTINCT c.rowid AS id, c.damana, c.espanol, c.lema, c.fuente, c.notas
         FROM conjugaciones c
         JOIN tokens_damana t
           ON t.tabla_origen = 'conjugaciones' AND t.id_origen = c.rowid
         WHERE t.palabra_normalizada = ?
         ORDER BY c.lema, c.rowid`,
      )
      .all(palabraNormalizada) as ConjugacionDto[];
  }

  listarConjugaciones(): ConjugacionDto[] {
    return this.db
      .prepare(
        'SELECT rowid AS id, damana, espanol, lema, fuente, notas FROM conjugaciones ORDER BY rowid',
      )
      .all() as ConjugacionDto[];
  }

  conjugacionesDe(lema: string): ConjugacionDto[] {
    return this.db
      .prepare(
        `SELECT rowid AS id, damana, espanol, lema, fuente, notas
         FROM conjugaciones WHERE lema = ? ORDER BY rowid`,
      )
      .all(lema) as ConjugacionDto[];
  }

  /**
   * Filas de una fuente con su texto damana y español ya ensamblados para
   * concordancia y retrieval. En oraciones la referencia marca las de
   * alineación dudosa con «(revisar)».
   */
  textosDe(fuente: FuenteCorpus): FilaTexto[] {
    switch (fuente) {
      case FuenteCorpus.oraciones:
        return (
          this.db
            .prepare(
              'SELECT rowid AS id, damana, espanol, estado FROM oraciones ORDER BY rowid',
            )
            .all() as any[]
        ).map((f) => ({
          id: f.id,
          referencia: f.estado === 'revisar' ? `oración ${f.id} (revisar)` : `oración ${f.id}`,
          textoDamana: f.damana,
          textoEspanol: f.espanol ?? '',
          estado: f.estado,
        }));
      case FuenteCorpus.frases:
        return (
          this.db
            .prepare('SELECT rowid AS id, fuente, damana, espanol FROM frases ORDER BY rowid')
            .all() as any[]
        ).map((f) => ({
          id: f.id,
          referencia: f.fuente ? `frase ${f.id} (${f.fuente})` : `frase ${f.id}`,
          textoDamana: f.damana,
          textoEspanol: f.espanol ?? '',
        }));
      case FuenteCorpus.vocabulario:
        return (
          this.db
            .prepare('SELECT rowid AS id, espanol, damana FROM vocabulario ORDER BY rowid')
            .all() as any[]
        ).map((f) => ({
          id: f.id,
          referencia: `vocabulario ${f.id}`,
          textoDamana: f.damana,
          textoEspanol: f.espanol,
        }));
      case FuenteCorpus.conjugaciones:
        return (
          this.db
            .prepare('SELECT rowid AS id, damana, espanol, lema FROM conjugaciones ORDER BY rowid')
            .all() as any[]
        ).map((f) => ({
          id: f.id,
          referencia: `conjugación ${f.id} (${f.lema})`,
          textoDamana: f.damana,
          textoEspanol: f.espanol,
        }));
    }
  }

  frecuenciaPorFuente(
    palabraNormalizada: string,
  ): { fuente: FuenteCorpus; frecuencia: number }[] {
    return this.db
      .prepare(
        `SELECT tabla_origen AS fuente, COUNT(*) AS frecuencia
         FROM tokens_damana WHERE palabra_normalizada = ?
         GROUP BY tabla_origen ORDER BY tabla_origen`,
      )
      .all(palabraNormalizada) as { fuente: FuenteCorpus; frecuencia: number }[];
  }

  origenesDe(
    palabraNormalizada: string,
  ): { fuente: FuenteCorpus; id: number }[] {
    return this.db
      .prepare(
        `SELECT DISTINCT tabla_origen AS fuente, id_origen AS id
         FROM tokens_damana WHERE palabra_normalizada = ?`,
      )
      .all(palabraNormalizada) as { fuente: FuenteCorpus; id: number }[];
  }

  textoEspanolDe(fuente: FuenteCorpus, id: number): string {
    const columna: Record<FuenteCorpus, string> = {
      [FuenteCorpus.oraciones]: 'oraciones',
      [FuenteCorpus.frases]: 'frases',
      [FuenteCorpus.vocabulario]: 'vocabulario',
      [FuenteCorpus.conjugaciones]: 'conjugaciones',
    };
    const fila = this.db
      .prepare(`SELECT espanol FROM ${columna[fuente]} WHERE rowid = ?`)
      .get(id) as { espanol: string | null } | undefined;
    return fila?.espanol ?? '';
  }

  /**
   * Todas las palabras damana con su frecuencia total y las formas
   * originales distintas con que aparecen (para la heurística de nombres
   * propios). El separador ',' es seguro: el tokenizador nunca produce
   * comas dentro de una palabra.
   */
  frecuenciasConOriginales(): FrecuenciaPalabra[] {
    return (
      this.db
        .prepare(
          `SELECT palabra_normalizada AS palabra, COUNT(*) AS frecuencia,
                  GROUP_CONCAT(DISTINCT palabra_original) AS originales
           FROM tokens_damana
           GROUP BY palabra_normalizada
           ORDER BY frecuencia DESC, palabra`,
        )
        .all() as any[]
    ).map((f) => ({
      palabra: f.palabra,
      frecuencia: f.frecuencia,
      originales: (f.originales as string).split(','),
    }));
  }
}
