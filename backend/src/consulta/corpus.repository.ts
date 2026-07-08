import { Inject, Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { CONEXION_DB } from '../database/database.constants';
import { FuenteCorpus } from './consulta.enums';
import { FraseDto, VocabularioDto } from './dto/consulta.dto';

export interface FilaTexto {
  id: number;
  referencia: string;
  textoDamana: string;
  textoEspanol: string;
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
      .prepare('SELECT rowid AS id, espanol, damana, notas FROM vocabulario ORDER BY rowid')
      .all() as VocabularioDto[];
  }

  listarFrases(): FraseDto[] {
    return this.db
      .prepare('SELECT rowid AS id, fuente, damana, espanol, notas FROM frases ORDER BY rowid')
      .all() as FraseDto[];
  }

  /**
   * Filas de una fuente con su texto damana y español ya ensamblados para
   * concordancia (en capítulos el título forma parte del texto buscable,
   * igual que en la tokenización del importador).
   */
  textosDe(fuente: FuenteCorpus): FilaTexto[] {
    switch (fuente) {
      case FuenteCorpus.capitulos:
        return (
          this.db
            .prepare(
              `SELECT rowid AS id, capitulo, titulo_damana, titulo_espanol, damana, espanol
               FROM capitulos ORDER BY capitulo`,
            )
            .all() as any[]
        ).map((f) => ({
          id: f.id,
          referencia: `capítulo ${f.capitulo}`,
          textoDamana: `${f.titulo_damana}\n${f.damana}`,
          textoEspanol: `${f.titulo_espanol}\n${f.espanol}`,
        }));
      case FuenteCorpus.frases:
        return (
          this.db
            .prepare('SELECT rowid AS id, fuente, damana, espanol FROM frases ORDER BY rowid')
            .all() as any[]
        ).map((f) => ({
          id: f.id,
          referencia: `frase ${f.id} (${f.fuente})`,
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
    switch (fuente) {
      case FuenteCorpus.capitulos: {
        const f = this.db
          .prepare('SELECT titulo_espanol, espanol FROM capitulos WHERE rowid = ?')
          .get(id) as any;
        return f ? `${f.titulo_espanol}\n${f.espanol}` : '';
      }
      case FuenteCorpus.frases: {
        const f = this.db
          .prepare('SELECT espanol FROM frases WHERE rowid = ?')
          .get(id) as any;
        return f?.espanol ?? '';
      }
      case FuenteCorpus.vocabulario: {
        const f = this.db
          .prepare('SELECT espanol FROM vocabulario WHERE rowid = ?')
          .get(id) as any;
        return f?.espanol ?? '';
      }
    }
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
