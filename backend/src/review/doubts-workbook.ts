import * as ExcelJS from 'exceljs';
import { YELLOW } from '../pending/pending.service';
import { REASON_TEXT } from './doubts';
import { DoubtsReport } from './doubts.service';

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
  title: string;
  width: number;
  /** Filled in by the speaker. */
  yellow?: boolean;
}

type Cell = string | number | null;

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: Column[],
  rows: Cell[][],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns.map((c) => ({ header: c.title, width: c.width }));
  const heading = sheet.getRow(1);
  heading.font = { bold: true };
  heading.alignment = { vertical: 'middle', wrapText: true };
  heading.height = 42;
  columns.forEach((c, i) => {
    heading.getCell(i + 1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: c.yellow ? YELLOW : HEADER_BLUE },
    };
  });
  for (const values of rows) {
    const row = sheet.addRow(values);
    row.alignment = { vertical: 'top', wrapText: true };
    columns.forEach((c, i) => {
      if (c.yellow) {
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
    [DOUBT_SHEETS.escritura, report.spelling.length, 'Cualquier hablante', 'La misma palabra aparece escrita de varias maneras. ¿Cuál es la correcta?'],
    [DOUBT_SHEETS.sinonimos, report.synonyms.reduce((s, g) => s + g.options.length, 0), 'Revisor con experiencia', 'Una palabra del español tiene varias en damana. ¿Significan lo mismo? ¿Cuándo se usa cada una?'],
    [DOUBT_SHEETS.polisemia, report.polysemy.reduce((s, g) => s + g.senses.length, 0), 'Revisor con experiencia', 'Una palabra damana tiene varios significados anotados. ¿Están todos bien? Incluye las que solo cambian por la tilde.'],
    [DOUBT_SHEETS.dudosas, report.doubtful.length, 'Revisor con experiencia', 'Entradas que no quedaron claras: iguales al español, con varias formas en una casilla o con notas confusas.'],
    [DOUBT_SHEETS.terminaciones, report.endings.reduce((s, t) => s + t.examples.length, 0), 'Revisor con experiencia', 'Terminaciones que se repiten en muchas palabras (-mba, -win, -ga…). ¿Qué le agregan a la palabra?'],
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
    formColumns.push({ title: i === 0 ? 'forma más usada' : `otra forma ${i}`, width: 20 });
    formColumns.push({ title: 'veces', width: 7 });
  }
  addSheet(
    workbook,
    DOUBT_SHEETS.escritura,
    [
      { title: 'n.º', width: 6 },
      { title: 'qué cambia', width: 18 },
      ...formColumns,
      { title: 'significado que tenemos', width: 28 },
      { title: 'ejemplo en damana', width: 44 },
      { title: 'ejemplo en español', width: 44 },
      { title: '¿Cuál es la forma correcta? (escríbala)', width: 26, yellow: true },
      { title: '¿Son palabras distintas? (sí / no)', width: 16, yellow: true },
      { title: 'comentario', width: 34, yellow: true },
    ],
    report.spelling.map((group, i) => {
      const cells: Cell[] = [];
      for (let f = 0; f < FORMS_PER_ROW; f++) {
        const form = group.forms[f];
        cells.push(form ? form.form : '', form ? form.frequency : '');
      }
      const meanings = [...new Set(group.forms.flatMap((f) => f.meanings))];
      const example = group.forms.find((f) => f.example)?.example;
      const leftover = group.forms.slice(FORMS_PER_ROW).map((f) => f.form);
      return [
        i + 1,
        group.type,
        ...cells,
        meanings.join(' / '),
        example?.damana ?? '',
        example?.spanish ?? '',
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
      { title: 'grupo', width: 7 },
      { title: 'español', width: 24 },
      { title: 'damana', width: 26 },
      { title: 'veces en el corpus', width: 10 },
      { title: 'categoría', width: 22 },
      { title: 'de dónde viene', width: 20 },
      { title: 'nota que traía', width: 34 },
      { title: '¿Está bien? (sí / no)', width: 12, yellow: true },
      { title: '¿Significa lo mismo que las otras del grupo? ¿Cuándo se usa esta?', width: 46, yellow: true },
    ],
    report.synonyms.flatMap((group, i) =>
      group.options.map((o): Cell[] => [
        i + 1,
        group.spanish,
        o.damana,
        o.frequency ?? '',
        o.category ?? '',
        o.source ?? '',
        o.notes ?? '',
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
      { title: 'grupo', width: 7 },
      { title: 'damana (como está escrita)', width: 26 },
      { title: 'español', width: 32 },
      { title: 'de dónde viene', width: 20 },
      { title: 'ojo', width: 22 },
      { title: '¿Está bien? (sí / no)', width: 12, yellow: true },
      { title: 'Explicación. Si solo cambia la tilde: ¿qué indica la tilde?', width: 50, yellow: true },
    ],
    report.polysemy.flatMap((group, i) =>
      group.senses.map((s): Cell[] => [
        i + 1,
        s.damana,
        s.spanish,
        s.source ?? '',
        group.accentOnly ? 'solo cambia la tilde' : '',
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
      { title: 'español', width: 24 },
      { title: 'damana', width: 26 },
      { title: 'nota que traía', width: 44 },
      { title: 'de dónde viene', width: 18 },
      { title: 'qué hay que aclarar', width: 50 },
      { title: 'Forma correcta en damana', width: 26, yellow: true },
      { title: 'Explicación', width: 44, yellow: true },
    ],
    report.doubtful.map((d): Cell[] => [
      d.entry.spanish,
      d.entry.damana,
      d.entry.notes ?? '',
      d.entry.source ?? '',
      [...d.reasons.map((m) => REASON_TEXT[m]), d.hint].filter(Boolean).join(' '),
      '',
      '',
    ]),
  );

  // 5. Endings
  addSheet(
    workbook,
    DOUBT_SHEETS.terminaciones,
    [
      { title: 'terminación', width: 13 },
      { title: 'en cuántas palabras aparece', width: 11 },
      { title: 'lo que ya sabemos', width: 30 },
      { title: 'palabra base', width: 18 },
      { title: 'significado', width: 22 },
      { title: 'palabra con la terminación', width: 22 },
      { title: 'oración en damana', width: 46 },
      { title: 'oración en español', width: 46 },
      { title: '¿Qué le agrega la terminación a la palabra?', width: 44, yellow: true },
    ],
    report.endings.flatMap((t) =>
      t.examples.map((e): Cell[] => [
        `-${t.ending}`,
        t.roots,
        t.alreadyKnown,
        e.root,
        e.meaning,
        e.form,
        e.example?.damana ?? '',
        e.example?.spanish ?? '',
        '',
      ]),
    ),
  );

  return workbook;
}
