#!/usr/bin/env node
// Paso 3 de INSTRUCCIONES-CLAUDE-CODE.md: arma material-externo/salida/
// preguntas_hablantes.xlsx con el formato de elicitación del proyecto.
//   hoja «elicitacion»: texto damana de la cartilla 2012 y de El camino del
//     muchacho con el español en amarillo (para cualquier hablante);
//   hoja «divergencias»: las del cruce de vocabulario, con una columna de
//     respuesta en amarillo (para el revisor).
// No toca /datos. Uso: node material-externo/herramientas/generar_preguntas_hablantes.js
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const resolver = (m) => require(require.resolve(m, { paths: [RAIZ, path.join(RAIZ, 'backend')] }));
const { parse } = resolver('csv-parse/sync');
const ExcelJS = resolver('exceljs');
const SALIDA = path.join(RAIZ, 'material-externo', 'salida');
const AMARILLO = 'FFFFF2CC';

const leerCsv = (ruta) => parse(fs.readFileSync(ruta), { columns: true, bom: true, skip_empty_lines: true });
const limpiar = (s) => s.replace(/ᵾ/g, 'ʉ').replace(/ᵽ/g, 'Ʉ').replace(/\s+/g, ' ').trim();
const pintar = (celda) => {
  celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARILLO } };
};

async function main() {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Corpus Damana';

  const instrucciones = libro.addWorksheet('instrucciones');
  instrucciones.getColumn(1).width = 110;
  for (const linea of [
    'Material externo del damana (21 oct 2026). Dos hojas:',
    '',
    'Hoja «elicitacion» (cualquier hablante): el damana ya está escrito (viene de la cartilla de 2012 y de',
    '«El camino del muchacho», 2018). Por favor escriba en las casillas amarillas qué quiere decir en español:',
    '  · palabra_es: la palabra suelta en español (fila con palabra_dm).',
    '  · ejemplo_es: la oración completa en español (fila con ejemplo_dm).',
    'Si una palabra está mal escrita o se dice de otra forma, escríbalo en «notas». No borre nada.',
    '',
    'Hoja «divergencias» (revisor): una misma palabra aparece distinta en el corpus y en una fuente externa, o la',
    'misma forma con dos significados. En «respuesta» indique cuál es la correcta, si son las dos, o si es otra cosa.',
    '',
    'La ʉ se puede escribir «u+» si el teclado no la tiene; la app la convierte.',
  ]) {
    instrucciones.addRow([linea]);
  }

  // --- hoja elicitacion ---
  const hoja = libro.addWorksheet('elicitacion');
  hoja.columns = [
    { header: 'id', key: 'id', width: 12 },
    { header: 'ambito', key: 'ambito', width: 14 },
    { header: 'palabra_es', key: 'palabra_es', width: 24 },
    { header: 'palabra_dm', key: 'palabra_dm', width: 24 },
    { header: 'ejemplo_es', key: 'ejemplo_es', width: 60 },
    { header: 'ejemplo_dm', key: 'ejemplo_dm', width: 60 },
    { header: 'variante', key: 'variante', width: 12 },
    { header: 'notas', key: 'notas', width: 40 },
  ];
  hoja.getRow(1).font = { bold: true };
  let n = 0;
  const fila = (ambito, palabraDm, ejemploDm, notas) => {
    n += 1;
    const r = hoja.addRow({
      id: `ext-${String(n).padStart(3, '0')}`,
      ambito,
      palabra_es: '',
      palabra_dm: palabraDm,
      ejemplo_es: '',
      ejemplo_dm: ejemploDm,
      variante: '',
      notas,
    });
    if (palabraDm) pintar(r.getCell('palabra_es'));
    if (ejemploDm) pintar(r.getCell('ejemplo_es'));
  };

  const cartilla = leerCsv(path.join(SALIDA, 'fuentes', 'cartilla2012_textos.csv'));
  for (const c of cartilla) {
    const nota = `Cartilla SIL 2012, lección ${c.leccion} (${c.palabra_clave})`;
    if (c.tipo === 'palabra') fila('cartilla', limpiar(c.damana), '', nota);
    else fila('cartilla', '', limpiar(c.damana), `${nota}: ${c.tipo}`);
  }
  const camino = leerCsv(path.join(SALIDA, 'fuentes', 'camino2018_lineas.csv'));
  for (const c of camino) {
    fila('relato', '', limpiar(c.damana), `El camino del muchacho (Casa Wiwa 2018), «${c.relato}»: ${c.tipo}`);
  }

  // --- hoja divergencias ---
  const div = libro.addWorksheet('divergencias');
  div.columns = [
    { header: 'n', key: 'n', width: 6 },
    { header: 'tipo', key: 'tipo', width: 34 },
    { header: 'español (corpus)', key: 'es_corpus', width: 30 },
    { header: 'damana (corpus)', key: 'dm_corpus', width: 26 },
    { header: 'español (fuente)', key: 'es_fuente', width: 30 },
    { header: 'damana (fuente)', key: 'dm_fuente', width: 26 },
    { header: 'fuente', key: 'fuente', width: 40 },
    { header: 'respuesta', key: 'respuesta', width: 40 },
  ];
  div.getRow(1).font = { bold: true };
  const divergencias = leerCsv(path.join(SALIDA, 'divergencias_vocabulario.csv'));
  const orden = ['mismo significado, otra grafía', 'misma forma damana, otro significado', 'grafía parecida, significado distinto', 'mismo significado, otra palabra'];
  divergencias.sort((a, b) => orden.indexOf(a.tipo_divergencia) - orden.indexOf(b.tipo_divergencia));
  divergencias.forEach((d, i) => {
    const r = div.addRow({
      n: i + 1,
      tipo: d.tipo_divergencia,
      es_corpus: d.espanol_corpus,
      dm_corpus: d.damana_corpus,
      es_fuente: d.espanol_fuente,
      dm_fuente: d.damana_fuente,
      fuente: d.fuente.replace(/ https?:\S+/, '').replace(/ (colombia\.)?sil\.org\S*( n\.º \d+)?/, ''),
      respuesta: '',
    });
    pintar(r.getCell('respuesta'));
  });

  const ruta = path.join(SALIDA, 'preguntas_hablantes.xlsx');
  await libro.xlsx.writeFile(ruta);
  console.log(`✔ ${ruta}: ${n} filas de elicitación, ${divergencias.length} divergencias`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
