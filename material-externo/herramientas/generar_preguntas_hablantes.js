#!/usr/bin/env node
// Arma material-externo/salida/preguntas_hablantes.xlsx: UN solo cuaderno para
// las hablantes con todo lo que el material externo dejó por confirmar.
// Hojas: instrucciones · palabras nuevas · escritura · significados ·
// palabras distintas · reglas · texto para traducir. Las casillas por llenar
// van en amarillo; nada se borra. No toca /datos.
// Uso: node material-externo/herramientas/generar_preguntas_hablantes.js
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const resolver = (m) => require(require.resolve(m, { paths: [RAIZ, path.join(RAIZ, 'backend')] }));
const { parse } = resolver('csv-parse/sync');
const ExcelJS = resolver('exceljs');
const SALIDA = path.join(RAIZ, 'material-externo', 'salida');
const AMARILLO = 'FFFFF2CC';
const GRIS = 'FFEFEFEF';

const leerCsv = (ruta) => parse(fs.readFileSync(ruta), { columns: true, bom: true, skip_empty_lines: true });
const limpiar = (s) => (s ?? '').replace(/ᵾ/g, 'ʉ').replace(/ᵽ/g, 'Ʉ').replace(/\s+/g, ' ').trim();
const pintar = (celda, color = AMARILLO) => {
  celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
};
const opciones = (celda, lista) => {
  celda.dataValidation = { type: 'list', allowBlank: true, formulae: [`"${lista.join(',')}"`] };
};
const cabecera = (hoja) => {
  hoja.getRow(1).font = { bold: true };
  hoja.getRow(1).alignment = { wrapText: true, vertical: 'top' };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
};
const ajustar = (hoja, claves) => {
  hoja.eachRow((fila) => {
    for (const clave of claves) fila.getCell(clave).alignment = { wrapText: true, vertical: 'top' };
  });
};

/** Nombre corto y comprensible de cada fuente. */
function fuenteCorta(fuente) {
  if (/Living Dictionary/.test(fuente)) return 'Diccionario en línea Living Dictionary (con hablantes wiwa)';
  if (/Swadesh/.test(fuente)) return 'Lista de palabras SIL 1990 (con José Ramón)';
  if (/Hoppe 1974/.test(fuente)) return 'Relato «La culebra», SIL 1974';
  if (/Hoppe 1973/.test(fuente)) return 'Objetos de la casa, SIL 1973';
  if (/Trillos/.test(fuente)) return 'Estudio de María Trillos, 2004';
  if (/Cartilla|cartilla/.test(fuente)) return 'Cartilla escolar SIL 2012';
  return fuente;
}
const confianzaDe = (notas) => (/confianza alta/.test(notas) ? 'alta' : /confianza baja/.test(notas) ? 'baja' : 'media');

async function main() {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Corpus Damana';
  const resumen = [];

  // ---------------- instrucciones ----------------
  const ins = libro.addWorksheet('instrucciones');
  ins.getColumn(1).width = 115;
  const lineas = [
    'CUADERNO PARA HABLANTES DE DAMANA — material externo (21 de octubre de 2026)',
    '',
    'Gracias por ayudarnos. Estas palabras y frases vienen de libros, listas y diccionarios viejos y nuevos sobre',
    'el damana. Queremos saber si están bien dichas y bien escritas HOY, según usted.',
    '',
    'Cómo llenar:',
    '  • Solo escriba en las casillas AMARILLAS. No borre ni cambie lo demás.',
    '  • Si una casilla pide sí/no, puede elegir de la lista o escribirlo.',
    '  • Si no sabe o no usa la palabra, escriba «no sé» o «no la uso». Eso también nos sirve.',
    '  • Si el teclado no tiene la letra ʉ, escriba «u+» (por ejemplo: nu+nka). La aplicación la convierte.',
    '  • Puede parar cuando quiera y seguir otro día: guarde el archivo con el mismo nombre.',
    '',
    'Qué hay en cada hoja:',
    '  2. palabras nuevas — palabras que no teníamos. ¿Se dicen así? Empiece por las primeras (son las más seguras).',
    '  3. escritura — la misma palabra escrita de dos formas. ¿Cuál es la correcta?',
    '  4. significados — la misma palabra con dos significados. ¿Cuál es el suyo?',
    '  5. palabras distintas — dos palabras para lo mismo. ¿Se usan las dos?',
    '  6. reglas — cómo se arma la pregunta, el «no», las órdenes. ¿Así se habla?',
    '  7. texto para traducir — frases en damana de una cartilla y de un cuento. Escriba qué dicen en español.',
    '',
    'Las hojas 2, 6 y 7 las puede llenar cualquier hablante. Las hojas 3, 4 y 5 conviene que las revise quien',
    'tenga experiencia escribiendo damana, porque definen cómo vamos a escribir cada palabra en adelante.',
  ];
  for (const l of lineas) ins.addRow([l]);
  ins.getRow(1).font = { bold: true, size: 13 };

  // ---------------- 2. palabras nuevas ----------------
  const pn = libro.addWorksheet('palabras nuevas');
  pn.columns = [
    { header: 'n', key: 'n', width: 5 },
    { header: 'en español', key: 'es', width: 26 },
    { header: 'en damana (como lo escribe la fuente)', key: 'dm', width: 28 },
    { header: 'de dónde viene', key: 'fuente', width: 34 },
    { header: 'seguridad', key: 'conf', width: 9 },
    { header: '¿Se dice así? (sí / no / más o menos)', key: 'ok', width: 16 },
    { header: 'Si no, ¿cómo se dice?', key: 'mejor', width: 26 },
    { header: 'Una frase de ejemplo en damana', key: 'ej_dm', width: 42 },
    { header: 'La misma frase en español', key: 'ej_es', width: 42 },
    { header: 'Notas (otra forma de escribirla, cuándo se usa…)', key: 'notas', width: 36 },
  ];
  cabecera(pn);
  const nuevas = leerCsv(path.join(SALIDA, 'vocabulario_nuevo.csv'));
  const ordenConf = { alta: 0, media: 1, baja: 2 };
  nuevas.sort((a, b) => ordenConf[confianzaDe(a.notas)] - ordenConf[confianzaDe(b.notas)]);
  nuevas.forEach((x, i) => {
    const f = pn.addRow({
      n: i + 1,
      es: x.espanol,
      dm: limpiar(x.damana),
      fuente: fuenteCorta(x.fuente),
      conf: confianzaDe(x.notas),
      ok: '', mejor: '', ej_dm: '', ej_es: '', notas: '',
    });
    for (const k of ['ok', 'mejor', 'ej_dm', 'ej_es', 'notas']) pintar(f.getCell(k));
    opciones(f.getCell('ok'), ['sí', 'no', 'más o menos', 'no sé']);
  });
  ajustar(pn, ['es', 'dm', 'fuente', 'mejor', 'ej_dm', 'ej_es', 'notas']);
  resumen.push(['palabras nuevas', nuevas.length]);

  // ---------------- 3-5. divergencias ----------------
  const div = leerCsv(path.join(SALIDA, 'divergencias_vocabulario.csv'));
  const por = (t) => div.filter((d) => d.tipo_divergencia === t);

  const esc = libro.addWorksheet('escritura');
  esc.columns = [
    { header: 'n', key: 'n', width: 5 },
    { header: 'qué quiere decir', key: 'es', width: 26 },
    { header: 'forma A (como la tenemos nosotros)', key: 'a', width: 28 },
    { header: 'forma B (como la trae la fuente)', key: 'b', width: 28 },
    { header: 'de dónde viene la forma B', key: 'fuente', width: 34 },
    { header: '¿Cuál es la correcta? (A / B / las dos)', key: 'cual', width: 16 },
    { header: 'Si se escribe de otra manera, escríbala', key: 'otra', width: 28 },
    { header: 'Notas', key: 'notas', width: 30 },
  ];
  cabecera(esc);
  const escritura = por('mismo significado, otra grafía');
  escritura.forEach((d, i) => {
    const f = esc.addRow({
      n: i + 1, es: d.espanol_fuente, a: d.damana_corpus, b: limpiar(d.damana_fuente),
      fuente: fuenteCorta(d.fuente), cual: '', otra: '', notas: '',
    });
    for (const k of ['cual', 'otra', 'notas']) pintar(f.getCell(k));
    opciones(f.getCell('cual'), ['A', 'B', 'las dos', 'ninguna', 'no sé']);
  });
  // Preguntas generales de escritura que salen de las 34 de arriba.
  for (const [pregunta, ejemplo] of [
    ['Después de g y k, ¿se escribe «gu/ku» o «gw/kw»?', 'Irrugua / Irrugwa (yuca); Makegua / Makegwa (cuatro)'],
    ['¿Se escribe «dz» o «dzh»?', 'Dzira / Dzhirra (agua); dziwa / Dzhiwa (lluvia)'],
    ['¿Se escribe «j» o «h»?', 'Jomʉn / Homʉn (bañarse)'],
    ['¿Se escribe «ch» o «tsh»?', 'Chwi / Tshui (tierra)'],
    ['¿Se dobla la r? («rr»)', 'Urraga / Uraga (casa); Irrugua / Irugua (yuca)'],
  ]) {
    const f = esc.addRow({ n: '', es: pregunta, a: ejemplo, b: '', fuente: 'pregunta general', cual: '', otra: '', notas: '' });
    f.getCell('es').font = { bold: true };
    pintar(f.getCell('cual'));
    pintar(f.getCell('otra'));
    pintar(f.getCell('notas'));
  }
  ajustar(esc, ['es', 'a', 'b', 'fuente', 'otra', 'notas']);
  resumen.push(['escritura', escritura.length + 5]);

  const sig = libro.addWorksheet('significados');
  sig.columns = [
    { header: 'n', key: 'n', width: 5 },
    { header: 'palabra en damana', key: 'dm', width: 24 },
    { header: 'significado A (como lo tenemos nosotros)', key: 'a', width: 34 },
    { header: 'significado B (según la fuente)', key: 'b', width: 34 },
    { header: 'de dónde viene B', key: 'fuente', width: 34 },
    { header: '¿Cuál es? (A / B / las dos / ninguna)', key: 'cual', width: 16 },
    { header: 'Si es otra cosa, ¿qué quiere decir?', key: 'otra', width: 30 },
    { header: 'Notas', key: 'notas', width: 30 },
  ];
  cabecera(sig);
  const significados = [...por('misma forma damana, otro significado'), ...por('grafía parecida, significado distinto')];
  significados.forEach((d, i) => {
    const parecida = d.tipo_divergencia.startsWith('grafía parecida');
    const f = sig.addRow({
      n: i + 1,
      dm: parecida ? `${d.damana_corpus}  ~  ${limpiar(d.damana_fuente)}` : d.damana_corpus,
      a: d.espanol_corpus, b: d.espanol_fuente, fuente: fuenteCorta(d.fuente),
      cual: '', otra: '', notas: parecida ? 'Ojo: están escritas un poco distinto. ¿Es la misma palabra?' : '',
    });
    for (const k of ['cual', 'otra']) pintar(f.getCell(k));
    pintar(f.getCell('notas'));
    opciones(f.getCell('cual'), ['A', 'B', 'las dos', 'ninguna', 'no sé']);
  });
  ajustar(sig, ['dm', 'a', 'b', 'fuente', 'otra', 'notas']);
  resumen.push(['significados', significados.length]);

  const pd = libro.addWorksheet('palabras distintas');
  pd.columns = [
    { header: 'n', key: 'n', width: 5 },
    { header: 'qué quiere decir', key: 'es', width: 28 },
    { header: 'palabra(s) que tenemos nosotros', key: 'a', width: 32 },
    { header: 'palabra que trae la fuente', key: 'b', width: 26 },
    { header: 'de dónde viene', key: 'fuente', width: 34 },
    { header: '¿Se usan las dos? (sí / solo la nuestra / solo la de la fuente)', key: 'cual', width: 20 },
    { header: '¿Hay diferencia entre ellas? ¿Cuál?', key: 'dif', width: 34 },
    { header: 'Notas', key: 'notas', width: 26 },
  ];
  cabecera(pd);
  const distintas = por('mismo significado, otra palabra');
  distintas.forEach((d, i) => {
    const f = pd.addRow({
      n: i + 1, es: d.espanol_fuente, a: d.damana_corpus, b: limpiar(d.damana_fuente),
      fuente: fuenteCorta(d.fuente), cual: '', dif: '', notas: '',
    });
    for (const k of ['cual', 'dif', 'notas']) pintar(f.getCell(k));
    opciones(f.getCell('cual'), ['sí, las dos', 'solo la nuestra', 'solo la de la fuente', 'ninguna', 'no sé']);
  });
  ajustar(pd, ['es', 'a', 'b', 'fuente', 'dif', 'notas']);
  resumen.push(['palabras distintas', distintas.length]);

  // ---------------- 6. reglas ----------------
  const rg = libro.addWorksheet('reglas');
  rg.columns = [
    { header: 'n', key: 'n', width: 5 },
    { header: 'qué queremos saber', key: 'que', width: 44 },
    { header: 'ejemplo en damana (de la fuente)', key: 'ej', width: 36 },
    { header: 'lo que creemos que significa', key: 'sig', width: 34 },
    { header: '¿Así se dice? (sí / no / más o menos)', key: 'ok', width: 16 },
    { header: 'Si no, ¿cómo lo diría usted?', key: 'mejor', width: 36 },
    { header: 'Otro ejemplo suyo, en damana', key: 'ej2', width: 36 },
    { header: 'Y su traducción', key: 'ej2_es', width: 32 },
    { header: 'Notas', key: 'notas', width: 26 },
  ];
  cabecera(rg);
  const reglas = leerCsv(path.join(SALIDA, 'fuentes', 'reglas_para_hablantes.csv'));
  reglas.forEach((r, i) => {
    const f = rg.addRow({
      n: i + 1, que: r.que_queremos_saber, ej: limpiar(r.ejemplo_damana), sig: r.significado,
      ok: '', mejor: '', ej2: '', ej2_es: '', notas: '',
    });
    for (const k of ['ok', 'mejor', 'ej2', 'ej2_es', 'notas']) pintar(f.getCell(k));
    opciones(f.getCell('ok'), ['sí', 'no', 'más o menos', 'no sé']);
    if (r.destacada === 'sí') f.getCell('que').font = { bold: true };
  });
  ajustar(rg, ['que', 'ej', 'sig', 'mejor', 'ej2', 'ej2_es', 'notas']);
  resumen.push(['reglas', reglas.length]);

  // ---------------- 7. texto para traducir (formato de elicitación) ----------------
  const tx = libro.addWorksheet('texto para traducir');
  tx.columns = [
    { header: 'id', key: 'id', width: 10 },
    { header: 'ambito', key: 'ambito', width: 12 },
    { header: 'palabra_es', key: 'palabra_es', width: 24 },
    { header: 'palabra_dm', key: 'palabra_dm', width: 24 },
    { header: 'ejemplo_es', key: 'ejemplo_es', width: 60 },
    { header: 'ejemplo_dm', key: 'ejemplo_dm', width: 60 },
    { header: 'variante', key: 'variante', width: 10 },
    { header: 'notas', key: 'notas', width: 40 },
  ];
  cabecera(tx);
  const aviso = tx.insertRow(2, {
    id: '', ambito: '', palabra_es: 'escriba aquí la palabra en español →', palabra_dm: '(palabra en damana)',
    ejemplo_es: 'escriba aquí la frase en español →', ejemplo_dm: '(frase en damana)', variante: '', notas: 'Esta fila es solo una guía; no la borre.',
  });
  aviso.font = { italic: true, color: { argb: 'FF666666' } };
  aviso.eachCell((c) => pintar(c, GRIS));
  let n = 0;
  const fila = (ambito, palabraDm, ejemploDm, notas) => {
    n += 1;
    const r = tx.addRow({
      id: `ext-${String(n).padStart(3, '0')}`, ambito, palabra_es: '', palabra_dm: palabraDm,
      ejemplo_es: '', ejemplo_dm: ejemploDm, variante: '', notas,
    });
    if (palabraDm) pintar(r.getCell('palabra_es'));
    if (ejemploDm) pintar(r.getCell('ejemplo_es'));
  };
  for (const c of leerCsv(path.join(SALIDA, 'fuentes', 'cartilla2012_textos.csv'))) {
    const nota = `Cartilla SIL 2012, lección ${c.leccion} (${c.palabra_clave})`;
    if (c.tipo === 'palabra') fila('cartilla', limpiar(c.damana), '', nota);
    else fila('cartilla', '', limpiar(c.damana), `${nota}: ${c.tipo}`);
  }
  for (const c of leerCsv(path.join(SALIDA, 'fuentes', 'camino2018_lineas.csv'))) {
    fila('relato', '', limpiar(c.damana), `El camino del muchacho (Casa Wiwa 2018), «${c.relato}»: ${c.tipo}`);
  }
  ajustar(tx, ['palabra_es', 'palabra_dm', 'ejemplo_es', 'ejemplo_dm', 'notas']);
  resumen.push(['texto para traducir', n]);

  const ruta = path.join(SALIDA, 'preguntas_hablantes.xlsx');
  await libro.xlsx.writeFile(ruta);
  console.log(`✔ ${ruta}`);
  for (const [hoja, filas] of resumen) console.log(`   ${hoja}: ${filas} filas`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
