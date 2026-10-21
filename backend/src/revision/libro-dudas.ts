import * as ExcelJS from 'exceljs';
import { AMARILLO } from '../pendientes/pendientes.service';
import { TEXTO_MOTIVO } from './dudas';
import { InformeDudas } from './dudas.service';

/** Nombres de las hojas, en el orden en que conviene llenarlas. */
export const HOJAS_DUDAS = {
  instrucciones: 'leer primero',
  escritura: '1 escritura',
  sinonimos: '2 mismo significado',
  polisemia: '3 varios significados',
  dudosas: '4 por aclarar',
  terminaciones: '5 terminaciones',
} as const;

const AZUL_ENCABEZADO = 'FFDCE8F0';
/** Cuántas formas distintas caben en columnas propias; el resto va en el comentario. */
const FORMAS_POR_FILA = 4;

interface Columna {
  titulo: string;
  ancho: number;
  /** La llena la hablante. */
  amarilla?: boolean;
}

type Celda = string | number | null;

function agregarHoja(
  libro: ExcelJS.Workbook,
  nombre: string,
  columnas: Columna[],
  filas: Celda[][],
): ExcelJS.Worksheet {
  const hoja = libro.addWorksheet(nombre);
  hoja.columns = columnas.map((c) => ({ header: c.titulo, width: c.ancho }));
  const encabezado = hoja.getRow(1);
  encabezado.font = { bold: true };
  encabezado.alignment = { vertical: 'middle', wrapText: true };
  encabezado.height = 42;
  columnas.forEach((c, i) => {
    encabezado.getCell(i + 1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: c.amarilla ? AMARILLO : AZUL_ENCABEZADO },
    };
  });
  for (const valores of filas) {
    const fila = hoja.addRow(valores);
    fila.alignment = { vertical: 'top', wrapText: true };
    columnas.forEach((c, i) => {
      if (c.amarilla) {
        fila.getCell(i + 1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: AMARILLO },
        };
      }
    });
  }
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  return hoja;
}

/**
 * Libro de Excel con todo lo que hay que aclarar con hablantes. Cada hoja
 * hace UN tipo de pregunta y solo se llenan las columnas amarillas. Las
 * tres últimas hojas piden criterio: son para quien tenga experiencia
 * traduciendo.
 */
export function construirLibroDudas(informe: InformeDudas, fecha: Date): ExcelJS.Workbook {
  const libro = new ExcelJS.Workbook();
  const dia = fecha.toISOString().slice(0, 10);

  const instrucciones = libro.addWorksheet(HOJAS_DUDAS.instrucciones);
  instrucciones.getColumn(1).width = 28;
  instrucciones.getColumn(2).width = 12;
  instrucciones.getColumn(3).width = 30;
  instrucciones.getColumn(4).width = 90;
  [
    [`DUDAS DEL DICCIONARIO Y DEL CORPUS — ${dia}`],
    [],
    ['Qué es esto: al juntar todas las fuentes encontramos palabras escritas de varias maneras, palabras con varios significados y notas que no entendemos. Necesitamos que nos digan cuál es la forma correcta.'],
    ['Cómo se llena: solo las casillas AMARILLAS. Si no saben algo, déjenlo vacío. No borren ni muevan filas.'],
    ['La ʉ (u partida) pueden escribirla como ü o como u+ ; nosotros la convertimos.'],
    ['Si las dos formas son correctas, o si significan cosas distintas, escríbanlo: eso también nos sirve.'],
    [],
    ['Hoja', 'Filas', 'Quién la llena', 'Qué se pregunta'],
    [HOJAS_DUDAS.escritura, informe.escritura.length, 'Cualquier hablante', 'La misma palabra aparece escrita de varias maneras. ¿Cuál es la correcta?'],
    [HOJAS_DUDAS.sinonimos, informe.sinonimos.reduce((s, g) => s + g.opciones.length, 0), 'Revisor con experiencia', 'Una palabra del español tiene varias en damana. ¿Significan lo mismo? ¿Cuándo se usa cada una?'],
    [HOJAS_DUDAS.polisemia, informe.polisemia.reduce((s, g) => s + g.sentidos.length, 0), 'Revisor con experiencia', 'Una palabra damana tiene varios significados anotados. ¿Están todos bien? Incluye las que solo cambian por la tilde.'],
    [HOJAS_DUDAS.dudosas, informe.dudosas.length, 'Revisor con experiencia', 'Entradas que no quedaron claras: iguales al español, con varias formas en una casilla o con notas confusas.'],
    [HOJAS_DUDAS.terminaciones, informe.terminaciones.reduce((s, t) => s + t.ejemplos.length, 0), 'Revisor con experiencia', 'Terminaciones que se repiten en muchas palabras (-mba, -win, -ga…). ¿Qué le agregan a la palabra?'],
  ].forEach((linea) => instrucciones.addRow(linea));
  instrucciones.getRow(1).font = { bold: true, size: 13 };
  instrucciones.getRow(8).font = { bold: true };
  instrucciones.eachRow((fila) => {
    fila.alignment = { vertical: 'top', wrapText: true };
  });
  for (const numero of [3, 4, 5, 6]) instrucciones.mergeCells(numero, 1, numero, 4);

  // 1. Escritura
  const columnasFormas: Columna[] = [];
  for (let i = 0; i < FORMAS_POR_FILA; i++) {
    columnasFormas.push({ titulo: i === 0 ? 'forma más usada' : `otra forma ${i}`, ancho: 20 });
    columnasFormas.push({ titulo: 'veces', ancho: 7 });
  }
  agregarHoja(
    libro,
    HOJAS_DUDAS.escritura,
    [
      { titulo: 'n.º', ancho: 6 },
      { titulo: 'qué cambia', ancho: 18 },
      ...columnasFormas,
      { titulo: 'significado que tenemos', ancho: 28 },
      { titulo: 'ejemplo en damana', ancho: 44 },
      { titulo: 'ejemplo en español', ancho: 44 },
      { titulo: '¿Cuál es la forma correcta? (escríbala)', ancho: 26, amarilla: true },
      { titulo: '¿Son palabras distintas? (sí / no)', ancho: 16, amarilla: true },
      { titulo: 'comentario', ancho: 34, amarilla: true },
    ],
    informe.escritura.map((grupo, i) => {
      const celdas: Celda[] = [];
      for (let f = 0; f < FORMAS_POR_FILA; f++) {
        const forma = grupo.formas[f];
        celdas.push(forma ? forma.forma : '', forma ? forma.frecuencia : '');
      }
      const significados = [...new Set(grupo.formas.flatMap((f) => f.significados))];
      const ejemplo = grupo.formas.find((f) => f.ejemplo)?.ejemplo;
      const sobrantes = grupo.formas.slice(FORMAS_POR_FILA).map((f) => f.forma);
      return [
        i + 1,
        grupo.tipo,
        ...celdas,
        significados.join(' / '),
        ejemplo?.damana ?? '',
        ejemplo?.espanol ?? '',
        '',
        '',
        sobrantes.length ? `También aparece: ${sobrantes.join(', ')}` : '',
      ];
    }),
  );

  // 2. Una palabra española, varias en damana
  agregarHoja(
    libro,
    HOJAS_DUDAS.sinonimos,
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
    informe.sinonimos.flatMap((grupo, i) =>
      grupo.opciones.map((o): Celda[] => [
        i + 1,
        grupo.espanol,
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

  // 3. Una forma damana, varios significados
  agregarHoja(
    libro,
    HOJAS_DUDAS.polisemia,
    [
      { titulo: 'grupo', ancho: 7 },
      { titulo: 'damana (como está escrita)', ancho: 26 },
      { titulo: 'español', ancho: 32 },
      { titulo: 'de dónde viene', ancho: 20 },
      { titulo: 'ojo', ancho: 22 },
      { titulo: '¿Está bien? (sí / no)', ancho: 12, amarilla: true },
      { titulo: 'Explicación. Si solo cambia la tilde: ¿qué indica la tilde?', ancho: 50, amarilla: true },
    ],
    informe.polisemia.flatMap((grupo, i) =>
      grupo.sentidos.map((s): Celda[] => [
        i + 1,
        s.damana,
        s.espanol,
        s.fuente ?? '',
        grupo.soloTilde ? 'solo cambia la tilde' : '',
        '',
        '',
      ]),
    ),
  );

  // 4. Entradas por aclarar
  agregarHoja(
    libro,
    HOJAS_DUDAS.dudosas,
    [
      { titulo: 'español', ancho: 24 },
      { titulo: 'damana', ancho: 26 },
      { titulo: 'nota que traía', ancho: 44 },
      { titulo: 'de dónde viene', ancho: 18 },
      { titulo: 'qué hay que aclarar', ancho: 50 },
      { titulo: 'Forma correcta en damana', ancho: 26, amarilla: true },
      { titulo: 'Explicación', ancho: 44, amarilla: true },
    ],
    informe.dudosas.map((d): Celda[] => [
      d.entrada.espanol,
      d.entrada.damana,
      d.entrada.notas ?? '',
      d.entrada.fuente ?? '',
      [...d.motivos.map((m) => TEXTO_MOTIVO[m]), d.pista].filter(Boolean).join(' '),
      '',
      '',
    ]),
  );

  // 5. Terminaciones
  agregarHoja(
    libro,
    HOJAS_DUDAS.terminaciones,
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
    informe.terminaciones.flatMap((t) =>
      t.ejemplos.map((e): Celda[] => [
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

  return libro;
}
