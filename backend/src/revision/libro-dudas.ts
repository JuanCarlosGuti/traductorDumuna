import * as ExcelJS from 'exceljs';
import { YELLOW } from '../pendientes/pendientes.service';
import { REASON_TEXT } from './dudas';
import { DoubtsReport } from './dudas.service';

/** Sheet names, in the order in which they should be filled in. */
export const DOUBT_SHEETS = {
  instrucciones: 'leer primero',
  escritura: '1 escritura',
  sinonimos: '2 mismo significado',
  polisemia: '3 varios significados',
  dudosas: '4 por aclarar',
  terminaciones: '5 terminaciones',
} as const;

const HEADER_BLUE = 'FFDCE8F0';
/** How many distinct forms fit in columns of their own; the rest go in the comment. */
const FORMS_PER_ROW = 4;

interface Column {
  titulo: string;
  ancho: number;
  /** Filled in by the speaker. */
  amarilla?: boolean;
}

type Cell = string | number | null;

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: Column[],
  rows: Cell[][],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns.map((c) => ({ header: c.titulo, width: c.ancho }));
  const heading = sheet.getRow(1);
  heading.font = { bold: true };
  heading.alignment = { vertical: 'middle', wrapText: true };
  heading.height = 42;
  columns.forEach((c, i) => {
    heading.getCell(i + 1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: c.amarilla ? YELLOW : HEADER_BLUE },
    };
  });
  for (const values of rows) {
    const row = sheet.addRow(values);
    row.alignment = { vertical: 'top', wrapText: true };
    columns.forEach((c, i) => {
      if (c.amarilla) {
        row.getCell(i + 1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: YELLOW },
        };
      }
    });
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return sheet;
}

/**
 * Excel workbook with everything that must be clarified with speakers. Each sheet
 * asks ONE kind of question and only the yellow columns are filled in. The
 * last three sheets call for judgement: they are for someone with experience
 * translating.
 */
export function buildDoubtsWorkbook(report: DoubtsReport, date: Date): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const day = date.toISOString().slice(0, 10);

  const instructions = workbook.addWorksheet(DOUBT_SHEETS.instrucciones);
  instructions.getColumn(1).width = 28;
  instructions.getColumn(2).width = 12;
  instructions.getColumn(3).width = 30;
  instructions.getColumn(4).width = 90;
  [
    [`DUDAS DEL DICCIONARIO Y DEL CORPUS — ${day}`],
    [],
    ['Qué es esto: al juntar todas las fuentes encontramos palabras escritas de varias maneras, palabras con varios significados y notas que no entendemos. Necesitamos que nos digan cuál es la forma correcta.'],
    ['Cómo se llena: solo las casillas AMARILLAS. Si no saben algo, déjenlo vacío. No borren ni muevan filas.'],
    ['La ʉ (u partida) pueden escribirla como ü o como u+ ; nosotros la convertimos.'],
    ['Si las dos formas son correctas, o si significan cosas distintas, escríbanlo: eso también nos sirve.'],
    [],
    ['Hoja', 'Filas', 'Quién la llena', 'Qué se pregunta'],
    [DOUBT_SHEETS.escritura, report.escritura.length, 'Cualquier hablante', 'La misma palabra aparece escrita de varias maneras. ¿Cuál es la correcta?'],
    [DOUBT_SHEETS.sinonimos, report.sinonimos.reduce((s, g) => s + g.opciones.length, 0), 'Revisor con experiencia', 'Una palabra del español tiene varias en damana. ¿Significan lo mismo? ¿Cuándo se usa cada una?'],
    [DOUBT_SHEETS.polisemia, report.polisemia.reduce((s, g) => s + g.sentidos.length, 0), 'Revisor con experiencia', 'Una palabra damana tiene varios significados anotados. ¿Están todos bien? Incluye las que solo cambian por la tilde.'],
    [DOUBT_SHEETS.dudosas, report.dudosas.length, 'Revisor con experiencia', 'Entradas que no quedaron claras: iguales al español, con varias formas en una casilla o con notas confusas.'],
    [DOUBT_SHEETS.terminaciones, report.terminaciones.reduce((s, t) => s + t.ejemplos.length, 0), 'Revisor con experiencia', 'Terminaciones que se repiten en muchas palabras (-mba, -win, -ga…). ¿Qué le agregan a la palabra?'],
  ].forEach((line) => instructions.addRow(line));
  instructions.getRow(1).font = { bold: true, size: 13 };
  instructions.getRow(8).font = { bold: true };
  instructions.eachRow((row) => {
    row.alignment = { vertical: 'top', wrapText: true };
  });
  for (const num of [3, 4, 5, 6]) instructions.mergeCells(num, 1, num, 4);

  // 1. Spelling
  const formColumns: Column[] = [];
  for (let i = 0; i < FORMS_PER_ROW; i++) {
    formColumns.push({ titulo: i === 0 ? 'forma más usada' : `otra forma ${i}`, ancho: 20 });
    formColumns.push({ titulo: 'veces', ancho: 7 });
  }
  addSheet(
    workbook,
    DOUBT_SHEETS.escritura,
    [
      { titulo: 'n.º', ancho: 6 },
      { titulo: 'qué cambia', ancho: 18 },
      ...formColumns,
      { titulo: 'significado que tenemos', ancho: 28 },
      { titulo: 'ejemplo en damana', ancho: 44 },
      { titulo: 'ejemplo en español', ancho: 44 },
      { titulo: '¿Cuál es la forma correcta? (escríbala)', ancho: 26, amarilla: true },
      { titulo: '¿Son palabras distintas? (sí / no)', ancho: 16, amarilla: true },
      { titulo: 'comentario', ancho: 34, amarilla: true },
    ],
    report.escritura.map((group, i) => {
      const cells: Cell[] = [];
      for (let f = 0; f < FORMS_PER_ROW; f++) {
        const form = group.formas[f];
        cells.push(form ? form.forma : '', form ? form.frecuencia : '');
      }
      const meanings = [...new Set(group.formas.flatMap((f) => f.significados))];
      const example = group.formas.find((f) => f.ejemplo)?.ejemplo;
      const leftover = group.formas.slice(FORMS_PER_ROW).map((f) => f.forma);
      return [
        i + 1,
        group.tipo,
        ...cells,
        meanings.join(' / '),
        example?.damana ?? '',
        example?.espanol ?? '',
        '',
        '',
        leftover.length ? `También aparece: ${leftover.join(', ')}` : '',
      ];
    }),
  );

  // 2. One Spanish word, several in Damana
  addSheet(
    workbook,
    DOUBT_SHEETS.sinonimos,
    [
      { titulo: 'grupo', ancho: 7 },
      { titulo: 'español', ancho: 24 },
      { titulo: 'damana', ancho: 26 },
      { titulo: 'veces en el corpus', ancho: 10 },
      { titulo: 'categoría', ancho: 22 },
      { titulo: 'de dónde viene', ancho: 20 },
      { titulo: 'nota que traía', ancho: 34 },
      { titulo: '¿Está bien? (sí / no)', ancho: 12, amarilla: true },
      { titulo: '¿Significa lo mismo que las otras del grupo? ¿Cuándo se usa esta?', ancho: 46, amarilla: true },
    ],
    report.sinonimos.flatMap((group, i) =>
      group.opciones.map((o): Cell[] => [
        i + 1,
        group.espanol,
        o.damana,
        o.frecuencia ?? '',
        o.categoria ?? '',
        o.fuente ?? '',
        o.notas ?? '',
        '',
        '',
      ]),
    ),
  );

  // 3. One Damana form, several meanings
  addSheet(
    workbook,
    DOUBT_SHEETS.polisemia,
    [
      { titulo: 'grupo', ancho: 7 },
      { titulo: 'damana (como está escrita)', ancho: 26 },
      { titulo: 'español', ancho: 32 },
      { titulo: 'de dónde viene', ancho: 20 },
      { titulo: 'ojo', ancho: 22 },
      { titulo: '¿Está bien? (sí / no)', ancho: 12, amarilla: true },
      { titulo: 'Explicación. Si solo cambia la tilde: ¿qué indica la tilde?', ancho: 50, amarilla: true },
    ],
    report.polisemia.flatMap((group, i) =>
      group.sentidos.map((s): Cell[] => [
        i + 1,
        s.damana,
        s.espanol,
        s.fuente ?? '',
        group.soloTilde ? 'solo cambia la tilde' : '',
        '',
        '',
      ]),
    ),
  );

  // 4. Entries to clarify
  addSheet(
    workbook,
    DOUBT_SHEETS.dudosas,
    [
      { titulo: 'español', ancho: 24 },
      { titulo: 'damana', ancho: 26 },
      { titulo: 'nota que traía', ancho: 44 },
      { titulo: 'de dónde viene', ancho: 18 },
      { titulo: 'qué hay que aclarar', ancho: 50 },
      { titulo: 'Forma correcta en damana', ancho: 26, amarilla: true },
      { titulo: 'Explicación', ancho: 44, amarilla: true },
    ],
    report.dudosas.map((d): Cell[] => [
      d.entrada.espanol,
      d.entrada.damana,
      d.entrada.notas ?? '',
      d.entrada.fuente ?? '',
      [...d.motivos.map((m) => REASON_TEXT[m]), d.pista].filter(Boolean).join(' '),
      '',
      '',
    ]),
  );

  // 5. Endings
  addSheet(
    workbook,
    DOUBT_SHEETS.terminaciones,
    [
      { titulo: 'terminación', ancho: 13 },
      { titulo: 'en cuántas palabras aparece', ancho: 11 },
      { titulo: 'lo que ya sabemos', ancho: 30 },
      { titulo: 'palabra base', ancho: 18 },
      { titulo: 'significado', ancho: 22 },
      { titulo: 'palabra con la terminación', ancho: 22 },
      { titulo: 'oración en damana', ancho: 46 },
      { titulo: 'oración en español', ancho: 46 },
      { titulo: '¿Qué le agrega la terminación a la palabra?', ancho: 44, amarilla: true },
    ],
    report.terminaciones.flatMap((t) =>
      t.ejemplos.map((e): Cell[] => [
        `-${t.terminacion}`,
        t.raices,
        t.yaSabemos,
        e.raiz,
        e.significado,
        e.forma,
        e.ejemplo?.damana ?? '',
        e.ejemplo?.espanol ?? '',
        '',
      ]),
    ),
  );

  return workbook;
}
