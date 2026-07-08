import { Inject, Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { CONEXION_DB } from '../database/database.constants';

export interface EstadisticasImportacion {
  capitulos: number;
  frases: number;
  vocabulario: number;
  totalTokens: number;
  topPalabras: { palabra: string; frecuencia: number }[];
}

interface FilaCapitulo {
  capitulo: string;
  titulo_damana: string;
  titulo_espanol: string;
  damana: string;
  espanol: string;
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
  notas: string;
}

@Injectable()
export class ImportadorService {
  constructor(@Inject(CONEXION_DB) private readonly db: Database) {}

  /**
   * Importa los 3 CSV de dirDatos de forma idempotente (DELETE + INSERT en
   * una sola transacción) y tokeniza el damana de las tres fuentes hacia
   * tokens_damana.
   */
  importarTodo(dirDatos: string): EstadisticasImportacion {
    const capitulos = this.leerCsv<FilaCapitulo>(dirDatos, 'corpus_capitulos.csv');
    const frases = this.leerCsv<FilaFrase>(dirDatos, 'corpus_frases.csv');
    const vocabulario = this.leerCsv<FilaVocabulario>(dirDatos, 'corpus_vocabulario.csv');

    const insertarTodo = this.db.transaction(() => {
      this.db.exec(
        'DELETE FROM tokens_damana; DELETE FROM capitulos; DELETE FROM frases; DELETE FROM vocabulario;',
      );

      const insCapitulo = this.db.prepare(
        `INSERT INTO capitulos (capitulo, titulo_damana, titulo_espanol, damana, espanol)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const fila of capitulos) {
        const info = insCapitulo.run(
          Number(fila.capitulo),
          fila.titulo_damana,
          fila.titulo_espanol,
          fila.damana,
          fila.espanol,
        );
        // El título también es buscable: se tokeniza junto al cuerpo,
        // con posiciones continuas.
        this.tokenizar(
          `${fila.titulo_damana}\n${fila.damana}`,
          'capitulos',
          info.lastInsertRowid as number,
        );
      }

      const insFrase = this.db.prepare(
        'INSERT INTO frases (fuente, damana, espanol, notas) VALUES (?, ?, ?, ?)',
      );
      for (const fila of frases) {
        const info = insFrase.run(fila.fuente, fila.damana, fila.espanol, fila.notas);
        this.tokenizar(fila.damana, 'frases', info.lastInsertRowid as number);
      }

      const insVocabulario = this.db.prepare(
        'INSERT INTO vocabulario (espanol, damana, notas) VALUES (?, ?, ?)',
      );
      for (const fila of vocabulario) {
        const info = insVocabulario.run(fila.espanol, fila.damana, fila.notas);
        this.tokenizar(fila.damana, 'vocabulario', info.lastInsertRowid as number);
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
      capitulos: contar('capitulos'),
      frases: contar('frases'),
      vocabulario: contar('vocabulario'),
      totalTokens: contar('tokens_damana'),
      topPalabras,
    };
  }
}
