import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PendingItemDto } from './dto/pending.dto';
import { PendingItem, PendingRepository } from './pending.repository';

/** Same colour used by the templates already sent to the speakers. */
export const YELLOW = 'FFFFF2CC';
/** The elicitation example must be short: the user's sentence is shortened. */
export const MAX_EXAMPLE_CHARS = 120;

/**
 * Columns of the elicitation workbook. It is filled in by Spanish-speaking
 * native speakers, so its headers stay in Spanish (ambito = scope,
 * palabra_es/palabra_dm = Spanish/Damana word, ejemplo_es/ejemplo_dm =
 * Spanish/Damana example, variante = variant, notas = notes).
 */
export const ELICITATION_COLUMNS = [
  'id',
  'ambito',
  'palabra_es',
  'palabra_dm',
  'ejemplo_es',
  'ejemplo_dm',
  'variante',
  'notas',
] as const;

export interface ExportedBatch {
  fileName: string;
  content: Buffer;
  rows: number;
}

/** Shortens at a word boundary and marks the cut with «…». */
export function shorten(text: string, maximum = MAX_EXAMPLE_CHARS): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maximum) return cleaned;
  const cut = cleaned.lastIndexOf(' ', maximum);
  return `${cleaned.slice(0, cut > maximum / 2 ? cut : maximum).trim()}…`;
}

/** A pending item as a row of the elicitation format (the native speaker fills in the blanks). */
export function elicitationRow(p: PendingItem): Record<(typeof ELICITATION_COLUMNS)[number], string> {
  const isSpanish = p.language === 'spanish';
  const context = shorten(p.context ?? '');
  const notes =
    p.origin === 'translator'
      ? `pedida ${p.timesRequested} ${p.timesRequested === 1 ? 'vez' : 'veces'} en el traductor`
      : 'quedó sin llenar en un lote anterior';
  return {
    id: `pend_${p.id}`,
    ambito: 'otro',
    palabra_es: isSpanish ? p.word : '',
    palabra_dm: isSpanish ? '' : p.word,
    ejemplo_es: isSpanish ? context : '',
    ejemplo_dm: isSpanish ? '' : context,
    variante: '',
    notas: notes,
  };
}

@Injectable()
export class PendingService {
  constructor(private readonly repo: PendingRepository) {}

  listAll(): PendingItemDto[] {
    return this.repo.listAll();
  }

  /**
   * Generates formato_elicitacion_pendientes_<fecha>.xlsx with the open
   * pending items (most requested first) and marks them as exported. The
   * cells the speakers must fill in are yellow, as in the
   * previous templates; the id is stable (pend_<rowid>) so that the
   * importer recognizes it when the batch comes back filled in.
   */
  async exportBatch(today: Date = new Date()): Promise<ExportedBatch> {
    const pendingItems = this.repo.listOpen();
    const date = today.toISOString().slice(0, 10);
    const workbook = new ExcelJS.Workbook();

    const instructions = workbook.addWorksheet('instrucciones');
    instructions.getColumn(1).width = 110;
    [
      `PENDIENTES DEL TRADUCTOR — ${date}`,
      '',
      'Son palabras que la gente pidió traducir y que todavía no están en el diccionario.',
      'Para cada fila: 1) escriban la palabra en damana (palabra_dm); 2) si pueden, traduzcan la oración de ejemplo (ejemplo_dm).',
      'Solo se llenan las columnas amarillas. La columna "notas" es opcional.',
      'La ʉ (u partida) pueden escribirla como ü o como u+ ; nosotros la convertimos.',
      'MUY IMPORTANTE: no borren, no muevan ni inserten celdas o filas. Si algo no lo saben, déjenlo vacío.',
    ].forEach((line) => instructions.addRow([line]));
    instructions.getRow(1).font = { bold: true };

    const sheet = workbook.addWorksheet('elicitacion');
    sheet.columns = [
      { header: 'id', key: 'id', width: 12 },
      { header: 'ambito', key: 'ambito', width: 14 },
      { header: 'palabra_es', key: 'palabra_es', width: 24 },
      { header: 'palabra_dm', key: 'palabra_dm', width: 24 },
      { header: 'ejemplo_es', key: 'ejemplo_es', width: 48 },
      { header: 'ejemplo_dm', key: 'ejemplo_dm', width: 48 },
      { header: 'variante', key: 'variante', width: 12 },
      { header: 'notas', key: 'notas', width: 40 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const p of pendingItems) {
      const row = sheet.addRow(elicitationRow(p));
      row.alignment = { vertical: 'top', wrapText: true };
      const toFill = p.language === 'spanish' ? ['palabra_dm', 'ejemplo_dm'] : ['palabra_es', 'ejemplo_es'];
      for (const key of toFill) {
        row.getCell(key).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: YELLOW },
        };
      }
    }

    const content = Buffer.from(await workbook.xlsx.writeBuffer());
    this.repo.markExported(pendingItems.map((p) => p.id), today.toISOString());
    return {
      fileName: `formato_elicitacion_pendientes_${date}.xlsx`,
      content: content,
      rows: pendingItems.length,
    };
  }
}
