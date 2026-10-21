#!/usr/bin/env node
// Paso aprobado por el dueño (21 oct 2026): las pendientes del lote 1 que el
// material externo cubre con seguridad ALTA entran al corpus. Arma las filas
// (formato de corpus_vocabulario_v3.csv) a partir de pendientes_cubiertas.csv
// y vocabulario_nuevo.csv, las guarda en salida/vocabulario_cargado_<fecha>.csv
// y, con --aplicar, las añade al final de datos/corpus_vocabulario_v3.csv
// (nunca borra ni cambia filas existentes).
// Preferencias cuando una pendiente tiene varias formas candidatas: la de
// una sola palabra, luego la del Living Dictionary, luego la que lleva ʉ.
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const { parse } = require(require.resolve('csv-parse/sync', { paths: [RAIZ, path.join(RAIZ, 'backend')] }));
const SALIDA = path.join(RAIZ, 'material-externo', 'salida');
const CSV_CORPUS = path.join(RAIZ, 'datos', 'corpus_vocabulario_v3.csv');
const aplicar = process.argv.includes('--aplicar');

const normalizar = (s) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/ñ/g, 'ñ').replace(/[̀-ͯ]/g, '').trim();
const leerCsv = (ruta) => parse(fs.readFileSync(ruta), { columns: true, bom: true, skip_empty_lines: true });
const campo = (v) => (/[",\n\r]/.test(v ?? '') ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
const fuenteCorta = (f) =>
  /Living Dictionary/.test(f) ? 'Living Dictionary 2026' : /Swadesh/.test(f) ? 'Swadesh SIL 1990' : /Hoppe 1974/.test(f) ? 'Hoppe 1974' : 'Hoppe 1973';
const url = (f) => (f.match(/https?:\S+/) ?? [''])[0];

const cubiertas = leerCsv(path.join(SALIDA, 'pendientes_cubiertas.csv')).filter((p) => p.cubierta_por.startsWith('material'));
const nuevas = leerCsv(path.join(SALIDA, 'vocabulario_nuevo.csv')).filter((n) => /confianza alta/.test(n.notas));
const yaEnCorpus = new Set(leerCsv(CSV_CORPUS).map((v) => `${normalizar(v.espanol)}|${normalizar(v.damana)}`));

const filas = [];
for (const p of cubiertas) {
  const formas = p.damana_propuesto.split(' | ').map((d) => normalizar(d));
  let candidatas = nuevas.filter((n) => formas.includes(normalizar(n.damana)));
  if (candidatas.length === 0) continue; // solo había formas de seguridad media
  // Variantes que solo difieren en ʉ/u: se queda la que lleva ʉ.
  candidatas = candidatas.filter(
    (c) => !candidatas.some((o) => o !== c && normalizar(o.damana).replace(/ʉ/g, 'u') === normalizar(c.damana).replace(/ʉ/g, 'u') && (o.damana.match(/ʉ/g) ?? []).length > (c.damana.match(/ʉ/g) ?? []).length),
  );
  candidatas.sort(
    (a, b) =>
      (a.damana.includes(' ') ? 1 : 0) - (b.damana.includes(' ') ? 1 : 0) ||
      (/Living/.test(a.fuente) ? 0 : 1) - (/Living/.test(b.fuente) ? 0 : 1) ||
      (b.damana.match(/ʉ/g) ?? []).length - (a.damana.match(/ʉ/g) ?? []).length,
  );
  const [mejor, ...otras] = candidatas;
  const clave = `${normalizar(mejor.espanol)}|${normalizar(mejor.damana)}`;
  if (yaEnCorpus.has(clave)) continue;
  yaEnCorpus.add(clave);
  const notas = [
    `cubre la pendiente «${p.pendiente}» del lote 1`,
    otras.length ? `otras formas en las fuentes: ${[...new Set(otras.map((o) => o.damana))].join(', ')}` : '',
    url(mejor.fuente) ? url(mejor.fuente) : '',
  ]
    .filter(Boolean)
    .join('; ');
  filas.push({ espanol: mejor.espanol, damana: mejor.damana, categoria: mejor.categoria, notas, fuente: fuenteCorta(mejor.fuente) });
}

const fecha = new Date().toISOString().slice(0, 10);
const columnas = ['espanol', 'damana', 'categoria', 'notas', 'fuente'];
const lineas = filas.map((f) => columnas.map((c) => campo(f[c])).join(','));
fs.writeFileSync(path.join(SALIDA, `vocabulario_cargado_${fecha}.csv`), '﻿' + [columnas.join(','), ...lineas].join('\r\n') + '\r\n', 'utf8');
console.log(`Filas preparadas: ${filas.length} (de ${cubiertas.length} pendientes cubiertas por el material externo)`);
for (const f of filas) console.log(`  ${f.espanol} → ${f.damana}  [${f.categoria}; ${f.fuente}]`);

if (aplicar) {
  let corpus = fs.readFileSync(CSV_CORPUS, 'utf8');
  const eol = corpus.includes('\r\n') ? '\r\n' : '\n';
  if (!corpus.endsWith('\n')) corpus += eol;
  fs.writeFileSync(CSV_CORPUS, corpus + lineas.join(eol) + eol, 'utf8');
  console.log(`✔ añadidas ${filas.length} filas al final de datos/corpus_vocabulario_v3.csv (nada existente se tocó)`);
} else {
  console.log('(sin --aplicar no se toca /datos)');
}
