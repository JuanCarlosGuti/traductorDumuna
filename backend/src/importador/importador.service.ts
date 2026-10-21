import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { corregirOrtografiaDamana } from '../comun/texto/ortografia';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { DominioCorpus } from '../consulta/consulta.enums';
import { inferirDisparador } from '../consulta/reglas';
import { CONEXION_DB } from '../database/database.constants';
import { PendientesRepository } from '../pendientes/pendientes.repository';
import {
  FilaElicitacion,
  interpretarFila,
  PlanElicitacion,
  planificarElicitacion,
} from './elicitacion';
import { claveEncabezado, columna, HojaLeida, leerLibro } from './leer-excel';
import { escribirPruebas } from './pruebas-csv';

export const ARCHIVO_VOCABULARIO = 'corpus_vocabulario_v3.csv';
export const ARCHIVO_REGLAS = 'reglas_damana.xlsx';
/** formato_elicitacion.xlsx, formato_elicitacion_lote1.xlsx, …_pendientes_2026-10-03.xlsx */
export const PATRON_ELICITACION = /^formato_elicitacion.*\.xlsx$/i;

export interface EstadisticasElicitacion {
  archivos: number;
  filas: number;
  vocabulario: number;
  oraciones: number;
  pruebas: number;
  pendientes: number;
  resueltas: number;
  idsRepetidos: number;
}

export interface EstadisticasImportacion {
  oraciones: number;
  frases: number;
  vocabulario: number;
  conjugaciones: number;
  reglas: number;
  nombresPropios: number;
  elicitacion: EstadisticasElicitacion;
  /** Filas que quedaron en pruebas_traduccion.csv tras fundir. */
  pruebasEnArchivo: number;
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

interface FilaRegla {
  tipo: string;
  forma: string;
  significado: string;
  ejemploBase: string;
  ejemploRegla: string;
  traduccionEjemplo: string;
  notas: string;
  disparador: string | null;
}

interface FilaNombrePropio {
  damana: string;
  espanol: string;
  seEscribeIgual: boolean;
  otrasGrafias: string;
  notas: string;
}

/** El folleto bíblico (lfb) es el único corpus «bíblico»; el resto es cotidiano. */
export function dominioDeOracion(fuente: string | undefined): DominioCorpus {
  return (fuente ?? '').trim().toLowerCase().startsWith('lfb')
    ? DominioCorpus.biblico
    : DominioCorpus.cotidiano;
}

@Injectable()
export class ImportadorService {
  private readonly logger = new Logger(ImportadorService.name);

  constructor(
    @Inject(CONEXION_DB) private readonly db: Database,
    private readonly pendientes: PendientesRepository,
  ) {}

  /**
   * Importa el corpus completo de forma idempotente: los 4 CSV, las reglas y
   * nombres propios de reglas_damana.xlsx y todos los lotes de elicitación
   * (formato_elicitacion*.xlsx). Las tablas de contenido se reconstruyen
   * (DELETE + INSERT en una transacción); progreso_srs, traducciones,
   * validadas y pendientes se conservan —en pendientes solo se añaden las
   * filas de elicitación sin llenar y se cierran las que llegaron
   * completas—. Una de cada 10 filas completas de elicitación se reserva
   * para pruebas_traduccion.csv y no entra al retrieval.
   */
  async importarTodo(dirDatos: string): Promise<EstadisticasImportacion> {
    const oraciones = this.leerCsv<FilaOracion>(dirDatos, 'corpus_oraciones.csv');
    const frases = this.leerCsv<FilaFrase>(dirDatos, 'corpus_frases_v2.csv');
    const vocabulario = this.leerCsv<FilaVocabulario>(dirDatos, ARCHIVO_VOCABULARIO);
    const conjugaciones = this.leerCsv<FilaConjugacion>(dirDatos, 'corpus_conjugaciones.csv');
    const { reglas, nombres } = await this.leerReglas(dirDatos);
    const elicitacion = await this.leerElicitacion(dirDatos);
    const plan = planificarElicitacion(elicitacion.filas);
    const ahora = new Date().toISOString();

    const insertarTodo = this.db.transaction(() => {
      this.db.exec(
        'DELETE FROM tokens_damana; DELETE FROM oraciones; DELETE FROM frases; ' +
          'DELETE FROM vocabulario; DELETE FROM conjugaciones; ' +
          'DELETE FROM reglas; DELETE FROM nombres_propios;',
      );

      // Las columnas damana pasan por corregirOrtografiaDamana (ü→ʉ, ver
      // comun/texto/ortografia.ts); los CSV fuente quedan intactos.
      const insOracion = this.db.prepare(
        `INSERT INTO oraciones (id_externo, damana, espanol, estado, fuente, dominio)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const fila of oraciones) {
        const damana = corregirOrtografiaDamana(fila.damana);
        const info = insOracion.run(
          fila.id,
          damana,
          fila.espanol,
          fila.estado,
          fila.fuente,
          dominioDeOracion(fila.fuente),
        );
        this.tokenizar(damana, 'oraciones', info.lastInsertRowid as number);
      }

      const insFrase = this.db.prepare(
        'INSERT INTO frases (fuente, damana, espanol, notas, dominio) VALUES (?, ?, ?, ?, ?)',
      );
      for (const fila of frases) {
        const damana = corregirOrtografiaDamana(fila.damana);
        const info = insFrase.run(
          fila.fuente,
          damana,
          fila.espanol,
          fila.notas,
          DominioCorpus.cotidiano,
        );
        this.tokenizar(damana, 'frases', info.lastInsertRowid as number);
      }

      const insVocabulario = this.db.prepare(
        `INSERT INTO vocabulario (espanol, damana, categoria, notas, fuente)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const fila of vocabulario) {
        const damana = corregirOrtografiaDamana(fila.damana);
        const info = insVocabulario.run(
          fila.espanol,
          damana,
          fila.categoria,
          fila.notas,
          fila.fuente,
        );
        this.tokenizar(damana, 'vocabulario', info.lastInsertRowid as number);
      }

      const insConjugacion = this.db.prepare(
        `INSERT INTO conjugaciones (damana, espanol, lema, fuente, notas)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const fila of conjugaciones) {
        const damana = corregirOrtografiaDamana(fila.damana);
        const info = insConjugacion.run(damana, fila.espanol, fila.lema, fila.fuente, fila.notas);
        this.tokenizar(damana, 'conjugaciones', info.lastInsertRowid as number);
      }

      const insRegla = this.db.prepare(
        `INSERT INTO reglas (tipo, forma, significado, ejemplo_base, ejemplo_regla,
                             traduccion_ejemplo, notas, disparador)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const r of reglas) {
        insRegla.run(
          r.tipo || null,
          r.forma,
          r.significado || null,
          r.ejemploBase || null,
          r.ejemploRegla || null,
          r.traduccionEjemplo || null,
          r.notas || null,
          r.disparador,
        );
      }

      const insNombre = this.db.prepare(
        `INSERT INTO nombres_propios (damana, espanol, se_escribe_igual, otras_grafias, notas)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const n of nombres) {
        insNombre.run(n.damana, n.espanol, n.seEscribeIgual ? 1 : 0, n.otrasGrafias || null, n.notas || null);
      }

      // Elicitación: vocabulario y oraciones cotidianas (las pruebas NO
      // entran a la base: viven solo en pruebas_traduccion.csv).
      for (const v of plan.vocabulario) {
        const info = insVocabulario.run(v.espanol, v.damana, v.categoria, v.notas || null, v.fuente);
        this.tokenizar(v.damana, 'vocabulario', info.lastInsertRowid as number);
      }
      for (const o of plan.oraciones) {
        const info = insOracion.run(
          o.idExterno,
          o.damana,
          o.espanol,
          'aprobado',
          o.fuente,
          DominioCorpus.cotidiano,
        );
        this.tokenizar(o.damana, 'oraciones', info.lastInsertRowid as number);
      }
      for (const p of plan.pendientes) {
        this.pendientes.registrarDeElicitacion(p.palabra, p.contexto, ahora);
      }
      for (const palabra of plan.resueltas) {
        this.pendientes.marcarResuelta(palabra, ahora);
      }
    });
    insertarTodo();

    const pruebas = escribirPruebas(dirDatos, plan.pruebas);
    return this.estadisticas(reglas.length, nombres.length, elicitacion, plan, pruebas.total);
  }

  private leerCsv<T>(dirDatos: string, nombre: string): T[] {
    const contenido = fs.readFileSync(path.join(dirDatos, nombre));
    return parse(contenido, {
      columns: true,
      bom: true,
      skip_empty_lines: true,
    }) as T[];
  }

  /**
   * reglas_damana.xlsx: hoja «reglas» y hoja «nombres propios». Es opcional
   * (un corpus de prueba puede no traerlo): si falta se avisa y se sigue.
   */
  private async leerReglas(
    dirDatos: string,
  ): Promise<{ reglas: FilaRegla[]; nombres: FilaNombrePropio[] }> {
    const ruta = path.join(dirDatos, ARCHIVO_REGLAS);
    if (!fs.existsSync(ruta)) {
      this.logger.warn(`No se encontró ${ARCHIVO_REGLAS}: se importa sin reglas ni nombres propios.`);
      return { reglas: [], nombres: [] };
    }
    const hojas = await leerLibro(ruta);
    const hojaReglas = hojas.find((h) => claveEncabezado(h.nombre).includes('regla'));
    const hojaNombres = hojas.find((h) => claveEncabezado(h.nombre).includes('nombre'));

    const reglas: FilaRegla[] = (hojaReglas?.filas ?? [])
      .map((f) => {
        const tipo = columna(f, 'tipo');
        const significado = columna(f, 'significado', 'que hace');
        return {
          tipo,
          forma: columna(f, 'forma'),
          significado,
          ejemploBase: columna(f, 'palabra base', 'base'),
          ejemploRegla: columna(f, 'con la regla'),
          traduccionEjemplo: columna(f, 'traduccion'),
          notas: columna(f, 'notas'),
          disparador: inferirDisparador(tipo, significado),
        };
      })
      .filter((r) => r.forma.length > 0);

    const nombres: FilaNombrePropio[] = (hojaNombres?.filas ?? [])
      .map((f) => ({
        damana: corregirOrtografiaDamana(columna(f, 'damana', 'como aparece')),
        espanol: columna(f, 'espanol', 'nombre en'),
        seEscribeIgual: !/^no/i.test(columna(f, 'igual').trim()),
        otrasGrafias: columna(f, 'grafias'),
        notas: columna(f, 'notas'),
      }))
      .filter((n) => n.damana.length > 0 && n.espanol.length > 0);

    return { reglas, nombres };
  }

  /**
   * Todos los lotes formato_elicitacion*.xlsx de la carpeta, en orden de
   * nombre. Se lee la hoja que tenga la columna palabra_es (las plantillas
   * traen además una hoja de instrucciones).
   */
  private async leerElicitacion(
    dirDatos: string,
  ): Promise<{ archivos: string[]; filas: FilaElicitacion[] }> {
    const archivos = fs
      .readdirSync(dirDatos)
      .filter((n) => PATRON_ELICITACION.test(n) && !n.startsWith('~$'))
      .sort((a, b) => a.localeCompare(b, 'es'));
    const filas: FilaElicitacion[] = [];
    for (const archivo of archivos) {
      const hojas = await leerLibro(path.join(dirDatos, archivo));
      const hoja = hojas.find((h) => tieneColumnas(h, 'palabra_es'));
      if (!hoja) {
        this.logger.warn(`${archivo}: ninguna hoja tiene la columna palabra_es; se omite.`);
        continue;
      }
      for (const cruda of hoja.filas) {
        const fila = interpretarFila(cruda, archivo);
        if (fila) filas.push(fila);
      }
    }
    return { archivos, filas };
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

  private estadisticas(
    reglas: number,
    nombresPropios: number,
    elicitacion: { archivos: string[]; filas: FilaElicitacion[] },
    plan: PlanElicitacion,
    pruebasEnArchivo: number,
  ): EstadisticasImportacion {
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
      reglas,
      nombresPropios,
      elicitacion: {
        archivos: elicitacion.archivos.length,
        filas: elicitacion.filas.length,
        vocabulario: plan.vocabulario.length,
        oraciones: plan.oraciones.length,
        pruebas: plan.pruebas.length,
        pendientes: plan.pendientes.length,
        resueltas: plan.resueltas.length,
        idsRepetidos: plan.idsRepetidos,
      },
      pruebasEnArchivo,
      totalTokens: contar('tokens_damana'),
      topPalabras,
    };
  }
}

function tieneColumnas(hoja: HojaLeida, ...columnas: string[]): boolean {
  const claves = new Set(hoja.encabezados.map(claveEncabezado));
  return columnas.every((c) => claves.has(c));
}
