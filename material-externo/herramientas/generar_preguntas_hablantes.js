#!/usr/bin/env node
// Arma dos cuadernos en material-externo/salida/ a partir del cruce:
//   preguntas_hablantes.xlsx      — SOLO dudas reales, para las hablantes (se paga
//                                   por palabra): significados en conflicto y las
//                                   cinco reglas prioritarias.
//   revision_material_externo.xlsx — todo lo demás, para el revisor (una persona):
//                                   palabras nuevas, escritura, palabras distintas,
//                                   reglas restantes, lo ya resuelto como informe y,
//                                   como opcional, el texto monolingüe por traducir.
// Casillas por llenar en amarillo; nada se borra. No toca /datos.
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
const hojaInstrucciones = (libro, lineas) => {
  const ins = libro.addWorksheet('instrucciones');
  ins.getColumn(1).width = 115;
  for (const l of lineas) ins.addRow([l]);
  ins.getRow(1).font = { bold: true, size: 13 };
};

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

// ---------------- datos ----------------
const nuevas = leerCsv(path.join(SALIDA, 'vocabulario_nuevo.csv'));
const div = leerCsv(path.join(SALIDA, 'divergencias_vocabulario.csv'));
const coincidencias = leerCsv(path.join(SALIDA, 'coincidencias_vocabulario.csv'));
const reglas = leerCsv(path.join(SALIDA, 'fuentes', 'reglas_para_hablantes.csv'));
const cartilla = leerCsv(path.join(SALIDA, 'fuentes', 'cartilla2012_textos.csv'));
const camino = leerCsv(path.join(SALIDA, 'fuentes', 'camino2018_lineas.csv'));
const por = (t) => div.filter((d) => d.tipo_divergencia === t);
const significadosTodos = por('misma forma damana, otro significado');
// A las hablantes solo van conflictos de palabras concretas de fuentes
// hechas con hablantes (Living Dictionary, Swadesh); las glosas literales de
// partículas de Hoppe 1974 («ima: éste / en esta manera») las resuelve el
// revisor. Una fila por palabra: si dos fuentes dan sentidos B distintos, se
// juntan.
const norm = (s) => limpiar(s).toLowerCase();
function fusionarPorPalabra(filas) {
  const porPalabra = new Map();
  for (const d of filas) {
    const clave = norm(d.damana_corpus.split(' | ')[0]);
    const previa = porPalabra.get(clave);
    if (!previa) {
      porPalabra.set(clave, { ...d, sentidosB: [d.espanol_fuente], fuentes: [fuenteCorta(d.fuente)] });
    } else {
      if (!previa.sentidosB.some((b) => norm(b) === norm(d.espanol_fuente))) previa.sentidosB.push(d.espanol_fuente);
      if (!previa.fuentes.includes(fuenteCorta(d.fuente))) previa.fuentes.push(fuenteCorta(d.fuente));
    }
  }
  return [...porPalabra.values()].map((d) => ({
    ...d,
    espanol_fuente: d.sentidosB.join(' / '),
    fuente: d.fuentes.join(' y '),
  }));
}
const significadosReales = fusionarPorPalabra(
  significadosTodos.filter((d) => /Living Dictionary|Swadesh/.test(d.fuente)),
);
const significadosHoppe = significadosTodos.filter((d) => /Hoppe/.test(d.fuente));
const grafiaParecida = por('grafía parecida, significado distinto');
const escritura = por('mismo significado, otra grafía');
const distintas = por('mismo significado, otra palabra');
const reglasPrioritarias = reglas.filter((r) => r.destacada === 'sí');
const reglasRestantes = reglas.filter((r) => r.destacada !== 'sí');

// ---------------- hojas reutilizables ----------------
function hojaSignificados(libro, filas, nombre, paraRevisor) {
  const sig = libro.addWorksheet(nombre);
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
  filas.forEach((d, i) => {
    const parecida = d.tipo_divergencia.startsWith('grafía parecida');
    const f = sig.addRow({
      n: i + 1,
      dm: parecida ? `${d.damana_corpus}  ~  ${limpiar(d.damana_fuente)}` : d.damana_corpus.split(' | ')[0],
      a: d.espanol_corpus, b: d.espanol_fuente, fuente: /Diccionario|Lista|Relato|Objetos|Estudio|Cartilla/.test(d.fuente) ? d.fuente : fuenteCorta(d.fuente),
      cual: '', otra: '', notas: parecida ? 'Están escritas un poco distinto. ¿Es la misma palabra?' : '',
    });
    for (const k of ['cual', 'otra', 'notas']) pintar(f.getCell(k));
    opciones(f.getCell('cual'), ['A', 'B', 'las dos', 'ninguna', 'no sé']);
  });
  ajustar(sig, ['dm', 'a', 'b', 'fuente', 'otra', 'notas']);
  return filas.length;
}

function hojaReglas(libro, filas, nombre) {
  const rg = libro.addWorksheet(nombre);
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
  filas.forEach((r, i) => {
    const f = rg.addRow({
      n: i + 1, que: r.que_queremos_saber, ej: limpiar(r.ejemplo_damana), sig: r.significado,
      ok: '', mejor: '', ej2: '', ej2_es: '', notas: '',
    });
    for (const k of ['ok', 'mejor', 'ej2', 'ej2_es', 'notas']) pintar(f.getCell(k));
    opciones(f.getCell('ok'), ['sí', 'no', 'más o menos', 'no sé']);
  });
  ajustar(rg, ['que', 'ej', 'sig', 'mejor', 'ej2', 'ej2_es', 'notas']);
  return filas.length;
}

// ---------------- cuaderno 1: hablantes (solo dudas reales) ----------------
async function cuadernoHablantes() {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Corpus Damana';
  hojaInstrucciones(libro, [
    'PREGUNTAS PARA HABLANTES DE DAMANA — material externo (21 de octubre de 2026)',
    '',
    'Gracias por ayudarnos. Aquí solo están las dudas que no pudimos resolver con los libros: son pocas a propósito.',
    '',
    'Cómo llenar:',
    '  • Solo escriba en las casillas AMARILLAS. No borre ni cambie lo demás.',
    '  • Donde pide A / B / las dos, puede elegir de la lista o escribirlo.',
    '  • Si no sabe o no usa la palabra, escriba «no sé» o «no la uso». Eso también nos sirve.',
    '  • Si el teclado no tiene la letra ʉ, escriba «u+» (por ejemplo: nu+nka). La aplicación la convierte.',
    '',
    'Hojas:',
    '  2. significados — una misma palabra damana que en un lado quiere decir una cosa y en otro lado otra. ¿Cuál es?',
    '  3. reglas — cinco cosas de cómo se habla (el «no», la pregunta, la prohibición, «cantemos»). ¿Así se dice?',
    '     En la hoja de reglas, el ejemplo propio que usted escriba vale tanto como la respuesta.',
  ]);
  const n1 = hojaSignificados(libro, significadosReales, 'significados', false);
  const n2 = hojaReglas(libro, reglasPrioritarias, 'reglas');
  const ruta = path.join(SALIDA, 'preguntas_hablantes.xlsx');
  await libro.xlsx.writeFile(ruta);
  console.log(`✔ ${ruta}\n   significados: ${n1} · reglas: ${n2}`);
}

// ---------------- cuaderno 2: revisor ----------------
async function cuadernoRevisor() {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Corpus Damana';
  const resumen = [];
  hojaInstrucciones(libro, [
    'REVISIÓN DEL MATERIAL EXTERNO — para el revisor (21 de octubre de 2026)',
    '',
    'Este cuaderno es para una sola persona con experiencia escribiendo damana. Nada de esto se le pregunta a las',
    'hablantes de primera pasada: lo que usted no pueda resolver, márquelo en «notas» con «preguntar» y se les pasa.',
    '',
    'Hojas:',
    '  2. palabras nuevas — palabras que no teníamos. Vienen de un diccionario en línea hecho con hablantes (seguridad',
    '     alta) y de listas de 1973-1990 con ortografía vieja convertida (seguridad media). ¿Se aceptan tal cual?',
    '  3. escritura — la misma palabra escrita de dos formas, y cinco preguntas de fondo (gu/gw, dz/dzh, j/h, ch/tsh, rr).',
    '     Lo que se decida aquí es la norma de escritura del corpus en adelante.',
    '  4. palabras distintas — dos palabras damana para lo mismo. ¿Sinónimos, registro distinto o error?',
    '  5. grafía parecida — palabras que se escriben casi igual con significado distinto. ¿Son la misma?',
    '  6. significados (Hoppe 1974) — partículas y palabras del relato de 1974 cuya glosa literal no coincide con la',
    '     nuestra («ima: éste / en esta manera»). Son de gramática; no se le preguntan a la hablante de primera pasada.',
    '  7. reglas — las reglas del estudio de Trillos que no fueron a las hablantes. ¿Están bien descritas?',
    '  8. ya resueltas — solo para que lo sepa: palabras que estaban con la glosa escrita distinto (Lea / leer) o con u',
    '     por ʉ, y se dieron por iguales sin preguntar (con ʉ prevalece la forma que la lleva). Si alguna NO es igual, anótelo.',
    '  9. texto por traducir (OPCIONAL) — frases en damana de una cartilla de 2012 y de un cuento, sin traducción.',
    '     Solo si se decide pagar ese trabajo; no es una duda.',
    '',
    'Casillas por llenar en amarillo. Si el teclado no tiene ʉ, escriba «u+».',
  ]);

  // 2. palabras nuevas
  const pn = libro.addWorksheet('palabras nuevas');
  pn.columns = [
    { header: 'n', key: 'n', width: 5 },
    { header: 'en español', key: 'es', width: 26 },
    { header: 'en damana (como lo escribe la fuente)', key: 'dm', width: 28 },
    { header: 'de dónde viene', key: 'fuente', width: 34 },
    { header: 'seguridad', key: 'conf', width: 9 },
    { header: '¿Se acepta? (sí / no / preguntar)', key: 'ok', width: 16 },
    { header: 'Si no, forma o significado correcto', key: 'mejor', width: 28 },
    { header: 'Notas', key: 'notas', width: 36 },
  ];
  cabecera(pn);
  const ordenConf = { alta: 0, media: 1, baja: 2 };
  const nuevasOrdenadas = [...nuevas].sort((a, b) => ordenConf[confianzaDe(a.notas)] - ordenConf[confianzaDe(b.notas)]);
  nuevasOrdenadas.forEach((x, i) => {
    const f = pn.addRow({
      n: i + 1, es: x.espanol, dm: limpiar(x.damana), fuente: fuenteCorta(x.fuente), conf: confianzaDe(x.notas),
      ok: '', mejor: '', notas: '',
    });
    for (const k of ['ok', 'mejor', 'notas']) pintar(f.getCell(k));
    opciones(f.getCell('ok'), ['sí', 'no', 'preguntar']);
  });
  ajustar(pn, ['es', 'dm', 'fuente', 'mejor', 'notas']);
  resumen.push(['palabras nuevas', nuevas.length]);

  // 3. escritura
  const esc = libro.addWorksheet('escritura');
  esc.columns = [
    { header: 'n', key: 'n', width: 5 },
    { header: 'qué quiere decir', key: 'es', width: 26 },
    { header: 'forma A (corpus)', key: 'a', width: 28 },
    { header: 'forma B (fuente)', key: 'b', width: 28 },
    { header: 'de dónde viene la forma B', key: 'fuente', width: 34 },
    { header: '¿Cuál es la correcta? (A / B / las dos)', key: 'cual', width: 16 },
    { header: 'Si se escribe de otra manera, escríbala', key: 'otra', width: 28 },
    { header: 'Notas', key: 'notas', width: 30 },
  ];
  cabecera(esc);
  escritura.forEach((d, i) => {
    const f = esc.addRow({
      n: i + 1, es: d.espanol_fuente, a: d.damana_corpus, b: limpiar(d.damana_fuente),
      fuente: fuenteCorta(d.fuente), cual: '', otra: '', notas: '',
    });
    for (const k of ['cual', 'otra', 'notas']) pintar(f.getCell(k));
    opciones(f.getCell('cual'), ['A', 'B', 'las dos', 'ninguna', 'preguntar']);
  });
  const generales = [
    ['Después de g y k, ¿se escribe «gu/ku» o «gw/kw»?', 'Irrugua / Irrugwa (yuca); Makegua / Makegwa (cuatro)'],
    ['¿Se escribe «dz» o «dzh»?', 'Dzira / Dzhirra (agua); dziwa / Dzhiwa (lluvia)'],
    ['¿Se escribe «j» o «h»?', 'Jomʉn / Homʉn (bañarse)'],
    ['¿Se escribe «ch» o «tsh»?', 'Chwi / Tshui (tierra)'],
    ['¿Se dobla la r? («rr»)', 'Urraga / Uraga (casa); Irrugua / Irugua (yuca)'],
  ];
  for (const [pregunta, ejemplo] of generales) {
    const f = esc.addRow({ n: '', es: pregunta, a: ejemplo, b: '', fuente: 'pregunta general', cual: '', otra: '', notas: '' });
    f.getCell('es').font = { bold: true };
    for (const k of ['cual', 'otra', 'notas']) pintar(f.getCell(k));
  }
  ajustar(esc, ['es', 'a', 'b', 'fuente', 'otra', 'notas']);
  resumen.push(['escritura', escritura.length + generales.length]);

  // 4. palabras distintas
  const pd = libro.addWorksheet('palabras distintas');
  pd.columns = [
    { header: 'n', key: 'n', width: 5 },
    { header: 'qué quiere decir', key: 'es', width: 28 },
    { header: 'palabra(s) del corpus', key: 'a', width: 32 },
    { header: 'palabra de la fuente', key: 'b', width: 26 },
    { header: 'de dónde viene', key: 'fuente', width: 34 },
    { header: '¿Se usan las dos? (sí / solo la del corpus / solo la de la fuente)', key: 'cual', width: 20 },
    { header: '¿Hay diferencia entre ellas? ¿Cuál?', key: 'dif', width: 34 },
    { header: 'Notas', key: 'notas', width: 26 },
  ];
  cabecera(pd);
  distintas.forEach((d, i) => {
    const f = pd.addRow({
      n: i + 1, es: d.espanol_fuente, a: d.damana_corpus, b: limpiar(d.damana_fuente),
      fuente: fuenteCorta(d.fuente), cual: '', dif: '', notas: '',
    });
    for (const k of ['cual', 'dif', 'notas']) pintar(f.getCell(k));
    opciones(f.getCell('cual'), ['sí, las dos', 'solo la del corpus', 'solo la de la fuente', 'ninguna', 'preguntar']);
  });
  ajustar(pd, ['es', 'a', 'b', 'fuente', 'dif', 'notas']);
  resumen.push(['palabras distintas', distintas.length]);

  // 5. grafía parecida y glosas literales de Hoppe 1974
  resumen.push(['grafía parecida', hojaSignificados(libro, grafiaParecida, 'grafía parecida', true)]);
  resumen.push(['significados (Hoppe 1974)', hojaSignificados(libro, significadosHoppe, 'significados (Hoppe 1974)', true)]);

  // 6. reglas restantes
  resumen.push(['reglas', hojaReglas(libro, reglasRestantes, 'reglas')]);

  // 6b. u por ʉ dentro del corpus (si corrió variantes_u_en_corpus.js)
  const rutaVariantes = path.join(SALIDA, 'variantes_u_en_corpus.csv');
  if (fs.existsSync(rutaVariantes)) {
    const vu = libro.addWorksheet('u por ʉ en el corpus');
    vu.columns = [
      { header: 'n', key: 'n', width: 5 },
      { header: 'como está escrita en las oraciones', key: 'variante', width: 24 },
      { header: 'forma con ʉ del vocabulario', key: 'forma', width: 24 },
      { header: 'qué quiere decir', key: 'es', width: 26 },
      { header: 'veces', key: 'veces', width: 7 },
      { header: 'ejemplo', key: 'ejemplo', width: 60 },
      { header: '¿Es la misma palabra? (sí: se corrige a ʉ / no: son dos palabras)', key: 'resp', width: 22 },
      { header: 'Notas', key: 'notas', width: 26 },
    ];
    cabecera(vu);
    const variantes = leerCsv(rutaVariantes);
    variantes.forEach((v, i) => {
      const f = vu.addRow({
        n: i + 1, variante: v.palabra_en_corpus, forma: v.forma_con_u_partida, es: v.espanol_vocabulario,
        veces: Number(v.veces), ejemplo: v.ejemplo, resp: '', notas: '',
      });
      pintar(f.getCell('resp'));
      pintar(f.getCell('notas'));
      opciones(f.getCell('resp'), ['sí, la misma', 'no, son dos palabras', 'no sé']);
    });
    ajustar(vu, ['variante', 'forma', 'es', 'ejemplo', 'notas']);
    resumen.push(['u por ʉ en el corpus', variantes.length]);
  }

  // 7. ya resueltas (informativo)
  const ya = libro.addWorksheet('ya resueltas');
  ya.columns = [
    { header: 'n', key: 'n', width: 5 },
    { header: 'palabra damana', key: 'dm', width: 24 },
    { header: 'glosa del corpus', key: 'a', width: 32 },
    { header: 'glosa de la fuente', key: 'b', width: 32 },
    { header: 'de dónde viene', key: 'fuente', width: 34 },
    { header: '¿NO es lo mismo? Anótelo aquí', key: 'notas', width: 36 },
  ];
  cabecera(ya);
  const resueltas = coincidencias.filter((c) => c.nota);
  resueltas.forEach((c, i) => {
    const f = ya.addRow({ n: i + 1, dm: c.damana_corpus, a: c.espanol_corpus, b: c.espanol, fuente: fuenteCorta(c.fuente_externa), notas: '' });
    pintar(f.getCell('notas'));
  });
  ajustar(ya, ['dm', 'a', 'b', 'fuente', 'notas']);
  resumen.push(['ya resueltas', resueltas.length]);

  // 8. texto por traducir (opcional)
  const tx = libro.addWorksheet('texto por traducir (opcional)');
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
    id: '', ambito: '', palabra_es: 'palabra en español →', palabra_dm: '(palabra en damana)',
    ejemplo_es: 'frase en español →', ejemplo_dm: '(frase en damana)', variante: '', notas: 'Fila guía; no borrar. Mismo formato de elicitación del proyecto.',
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
  for (const c of cartilla) {
    const nota = `Cartilla SIL 2012, lección ${c.leccion} (${c.palabra_clave})`;
    if (c.tipo === 'palabra') fila('cartilla', limpiar(c.damana), '', nota);
    else fila('cartilla', '', limpiar(c.damana), `${nota}: ${c.tipo}`);
  }
  for (const c of camino) {
    fila('relato', '', limpiar(c.damana), `El camino del muchacho (Casa Wiwa 2018), «${c.relato}»: ${c.tipo}`);
  }
  ajustar(tx, ['palabra_es', 'palabra_dm', 'ejemplo_es', 'ejemplo_dm', 'notas']);
  resumen.push(['texto por traducir (opcional)', n]);

  const ruta = path.join(SALIDA, 'revision_material_externo.xlsx');
  await libro.xlsx.writeFile(ruta);
  console.log(`✔ ${ruta}`);
  for (const [hoja, filas] of resumen) console.log(`   ${hoja}: ${filas} filas`);
}

Promise.all([cuadernoHablantes(), cuadernoRevisor()]).catch((e) => {
  console.error(e);
  process.exit(1);
});
