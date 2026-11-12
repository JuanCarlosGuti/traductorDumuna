import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PendienteDto } from './dto/pendientes.dto';
import { Pendiente, PendientesRepository } from './pendientes.repository';

/** Same colour used by the templates already sent to the speakers. */
export const AMARILLO = 'FFFFF2CC';
/** The elicitation example must be short: the user's sentence is shortened. */
export const MAX_CARACTERES_EJEMPLO = 120;

export const COLUMNAS_ELICITACION = [
  'id',
  'ambito',
  'palabra_es',
  'palabra_dm',
  'ejemplo_es',
  'ejemplo_dm',
  'variante',
  'notas',
] as const;

export interface LoteExportado {
  nombreArchivo: string;
  contenido: Buffer;
  filas: number;
}

/** Shortens at a word boundary and marks the cut with «…». */
export function acortar(texto: string, maximo = MAX_CARACTERES_EJEMPLO): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (limpio.length <= maximo) return limpio;
  const corte = limpio.lastIndexOf(' ', maximo);
  return `${limpio.slice(0, corte > maximo / 2 ? corte : maximo).trim()}…`;
}

/** A pending item as a row of the elicitation format (the native speaker fills in the blanks). */
export function filaDeElicitacion(p: Pendiente): Record<(typeof COLUMNAS_ELICITACION)[number], string> {
  const esEspanol = p.idioma === 'espanol';
  const contexto = acortar(p.contexto ?? '');
  const notas =
    p.origen === 'traductor'
      ? `pedida ${p.vecesPedida} ${p.vecesPedida === 1 ? 'vez' : 'veces'} en el traductor`
      : 'quedó sin llenar en un lote anterior';
  return {
    id: `pend_${p.id}`,
    ambito: 'otro',
    palabra_es: esEspanol ? p.palabra : '',
    palabra_dm: esEspanol ? '' : p.palabra,
    ejemplo_es: esEspanol ? contexto : '',
    ejemplo_dm: esEspanol ? '' : contexto,
    variante: '',
    notas,
  };
}

@Injectable()
export class PendientesService {
  constructor(private readonly repo: PendientesRepository) {}

  listar(): PendienteDto[] {
    return this.repo.listar();
  }

  /**
   * Generates formato_elicitacion_pendientes_<fecha>.xlsx with the open
   * pending items (most requested first) and marks them as exported. The
   * cells the speakers must fill in are yellow, as in the
   * previous templates; the id is stable (pend_<rowid>) so that the
   * importer recognizes it when the batch comes back filled in.
   */
  async exportarLote(hoy: Date = new Date()): Promise<LoteExportado> {
    const pendientes = this.repo.listarAbiertas();
    const fecha = hoy.toISOString().slice(0, 10);
    const libro = new ExcelJS.Workbook();

    const instrucciones = libro.addWorksheet('instrucciones');
    instrucciones.getColumn(1).width = 110;
    [
      `PENDIENTES DEL TRADUCTOR — ${fecha}`,
      '',
      'Son palabras que la gente pidió traducir y que todavía no están en el diccionario.',
      'Para cada fila: 1) escriban la palabra en damana (palabra_dm); 2) si pueden, traduzcan la oración de ejemplo (ejemplo_dm).',
      'Solo se llenan las columnas amarillas. La columna "notas" es opcional.',
      'La ʉ (u partida) pueden escribirla como ü o como u+ ; nosotros la convertimos.',
      'MUY IMPORTANTE: no borren, no muevan ni inserten celdas o filas. Si algo no lo saben, déjenlo vacío.',
    ].forEach((linea) => instrucciones.addRow([linea]));
    instrucciones.getRow(1).font = { bold: true };

    const hoja = libro.addWorksheet('elicitacion');
    hoja.columns = [
      { header: 'id', key: 'id', width: 12 },
      { header: 'ambito', key: 'ambito', width: 14 },
      { header: 'palabra_es', key: 'palabra_es', width: 24 },
      { header: 'palabra_dm', key: 'palabra_dm', width: 24 },
      { header: 'ejemplo_es', key: 'ejemplo_es', width: 48 },
      { header: 'ejemplo_dm', key: 'ejemplo_dm', width: 48 },
      { header: 'variante', key: 'variante', width: 12 },
      { header: 'notas', key: 'notas', width: 40 },
    ];
    hoja.getRow(1).font = { bold: true };
    hoja.views = [{ state: 'frozen', ySplit: 1 }];

    for (const p of pendientes) {
      const fila = hoja.addRow(filaDeElicitacion(p));
      fila.alignment = { vertical: 'top', wrapText: true };
      const porLlenar = p.idioma === 'espanol' ? ['palabra_dm', 'ejemplo_dm'] : ['palabra_es', 'ejemplo_es'];
      for (const clave of porLlenar) {
        fila.getCell(clave).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: AMARILLO },
        };
      }
    }

    const contenido = Buffer.from(await libro.xlsx.writeBuffer());
    this.repo.marcarExportadas(pendientes.map((p) => p.id), hoy.toISOString());
    return {
      nombreArchivo: `formato_elicitacion_pendientes_${fecha}.xlsx`,
      contenido,
      filas: pendientes.length,
    };
  }
}
