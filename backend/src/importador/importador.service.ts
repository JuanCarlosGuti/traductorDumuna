import { Inject, Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { CONEXION_DB } from '../database/database.constants';

export interface EstadisticasImportacion {
  oraciones: number;
  frases: number;
  vocabulario: number;
  conjugaciones: number;
  totalTokens: number;
  topPalabras: { palabra: string; frecuencia: number }[];
}

interface FilaOracion {
  id: string;
  damana: string;
  espanol: string;
  estado: string;
  fuente: string;
}

interface FilaFrase {
  fuente: string;
  damana: string;
  espanol: string;
  notas: string;
}

interface FilaVocabulario {
  espanol: string;
  damana: string;
  categoria: string;
  notas: string;
  fuente: string;
}

interface FilaConjugacion {
  damana: string;
  espanol: string;
  lema: string;
  fuente: string;
  notas: string;
}

@Injectable()
export class ImportadorService {
  constructor(@Inject(CONEXION_DB) private readonly db: Database) {}

  /**
   * Importa los 4 CSV del corpus v3 de forma idempotente (DELETE + INSERT
   * en una sola transacción) y tokeniza el damana de las cuatro fuentes
   * hacia tokens_damana. No toca progreso_srs.
   */
  importarTodo(dirDatos: string): EstadisticasImportacion {
    const oraciones = this.leerCsv<FilaOracion>(dirDatos, 'corpus_oraciones.csv');
    const frases = this.leerCsv<FilaFrase>(dirDatos, 'corpus_frases_v2.csv');
    const vocabulario = this.leerCsv<FilaVocabulario>(dirDatos, 'corpus_vocabulario_v2.csv');
    const conjugaciones = this.leerCsv<FilaConjugacion>(dirDatos, 'corpus_conjugaciones.csv');

    const insertarTodo = this.db.transaction(() => {
      this.db.exec(
        'DELETE FROM tokens_damana; DELETE FROM oraciones; DELETE FROM frases; ' +
          'DELETE FROM vocabulario; DELETE FROM conjugaciones;',
      );

      const insOracion = this.db.prepare(
        `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const fila of oraciones) {
        const info = insOracion.run(fila.id, fila.damana, fila.espanol, fila.estado, fila.fuente);
        this.tokenizar(fila.damana, 'oraciones', info.lastInsertRowid as number);
      }

      const insFrase = this.db.prepare(
        'INSERT INTO frases (fuente, damana, espanol, notas) VALUES (?, ?, ?, ?)',
      );
      for (const fila of frases) {
        const info = insFrase.run(fila.fuente, fila.damana, fila.espanol, fila.notas);
        this.tokenizar(fila.damana, 'frases', info.lastInsertRowid as number);
      }

      const insVocabulario = this.db.prepare(
        `INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const fila of vocabulario) {
        const info = insVocabulario.run(
          fila.espanol,
          fila.damana,
          fila.categoria,
          fila.notas,
          fila.fuente,
        );
        this.tokenizar(fila.damana, 'vocabulario', info.lastInsertRowid as number);
      }

      const insConjugacion = this.db.prepare(
        `INSERT INTO conjugaciones (damana, espanol, lema, fuente, notas)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const fila of conjugaciones) {
        const info = insConjugacion.run(fila.damana, fila.espanol, fila.lema, fila.fuente, fila.notas);
        this.tokenizar(fila.damana, 'conjugaciones', info.lastInsertRowid as number);
      }
    });
    insertarTodo();

    return this.estadisticas();
  }

  private leerCsv<T>(dirDatos: string, nombre: string): T[] {
    const contenido = fs.readFileSync(path.join(dirDatos, nombre));
    return parse(contenido, {
      columns: true,
      bom: true,
      skip_empty_lines: true,
    }) as T[];
  }

  private tokenizar(texto: string, tablaOrigen: string, idOrigen: number): void {
    const insToken = this.db.prepare(
      `INSERT INTO tokens_damana (palabra_normalizada, palabra_original, tabla_origen, id_origen, posicion)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const token of tokenizarDamana(texto)) {
      insToken.run(token.normalizada, token.original, tablaOrigen, idOrigen, token.posicion);
    }
  }

  private estadisticas(): EstadisticasImportacion {
    const contar = (tabla: string): number =>
      (this.db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get() as { n: number }).n;

    const topPalabras = this.db
      .prepare(
        `SELECT palabra_normalizada AS palabra, COUNT(*) AS frecuencia
         FROM tokens_damana
         GROUP BY palabra_normalizada
         ORDER BY frecuencia DESC, palabra_normalizada
         LIMIT 20`,
      )
      .all() as { palabra: string; frecuencia: number }[];

    return {
      oraciones: contar('oraciones'),
      frases: contar('frases'),
      vocabulario: contar('vocabulario'),
      conjugaciones: contar('conjugaciones'),
      totalTokens: contar('tokens_damana'),
      topPalabras,
    };
  }
}
