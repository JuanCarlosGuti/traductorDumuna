#!/usr/bin/env node
// Regla del dueño (21 oct 2026): entre dos formas de la misma palabra que
// solo difieren en ʉ / u prevalece la que lleva ʉ. Este escaneo busca en las
// oraciones, frases y conjugaciones del corpus palabras escritas con u cuya
// forma con ʉ está en el vocabulario y cuya forma con u NO es otra palabra
// del vocabulario. Escribe material-externo/salida/variantes_u_en_corpus.csv
// para el revisor: no corrige nada, porque una variante puede ser una
// palabra distinta (p. ej. «duma» aparece también en la cartilla de 2012).
// Uso: node material-externo/herramientas/variantes_u_en_corpus.js
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const { parse } = require(require.resolve('csv-parse/sync', { paths: [RAIZ, path.join(RAIZ, 'backend')] }));
const DATOS = path.join(RAIZ, 'datos');
const SALIDA = path.join(RAIZ, 'material-externo', 'salida');

const normalizar = (s) =>
  s.toLowerCase().normalize('NFD').replace(/ñ/g, 'ñ').replace(/[̀-ͯ]/g, '');
const tokens = (s) => normalizar(s).split(/[^\p{L}ʉ']+/u).filter(Boolean);
const leerCsv = (nombre) => parse(fs.readFileSync(path.join(DATOS, nombre)), { columns: true, bom: true });
const campo = (v) => (/[",\n\r]/.test(v ?? '') ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));

const vocab = leerCsv('corpus_vocabulario_v3.csv');
const formas = new Set();
const conU = new Map(); // variante con u → forma con ʉ (y su español)
for (const v of vocab) {
  const t = tokens(v.damana);
  if (t.length !== 1) continue;
  formas.add(t[0]);
  if (t[0].includes('ʉ')) conU.set(t[0].replace(/ʉ/g, 'u'), { forma: t[0], espanol: v.espanol });
}
const candidatas = new Map([...conU].filter(([u]) => !formas.has(u)));

const fuentes = [
  ['oraciones', 'corpus_oraciones.csv', (f) => f.id],
  ['frases', 'corpus_frases_v2.csv', (f) => f.fuente],
  ['conjugaciones', 'corpus_conjugaciones.csv', (f) => f.lema],
];
const hallazgos = new Map();
for (const [nombre, archivo, ref] of fuentes) {
  for (const f of leerCsv(archivo)) {
    for (const t of new Set(tokens(f.damana))) {
      const c = candidatas.get(t);
      if (!c) continue;
      const h = hallazgos.get(t) ?? { variante: t, forma: c.forma, espanol: c.espanol, veces: 0, donde: new Set(), ejemplo: '' };
      h.veces += 1;
      h.donde.add(`${nombre} ${ref(f)}`);
      if (!h.ejemplo) h.ejemplo = f.damana.replace(/\s+/g, ' ').trim().slice(0, 120);
      hallazgos.set(t, h);
    }
  }
}
const filas = [...hallazgos.values()].sort((a, b) => b.veces - a.veces);
const columnas = ['palabra_en_corpus', 'forma_con_u_partida', 'espanol_vocabulario', 'veces', 'donde', 'ejemplo', 'respuesta'];
const lineas = [
  columnas.join(','),
  ...filas.map((h) =>
    [h.variante, h.forma, h.espanol, h.veces, [...h.donde].slice(0, 6).join('; ') + (h.donde.size > 6 ? '; …' : ''), h.ejemplo, '']
      .map(campo)
      .join(','),
  ),
];
fs.mkdirSync(SALIDA, { recursive: true });
fs.writeFileSync(path.join(SALIDA, 'variantes_u_en_corpus.csv'), '﻿' + lineas.join('\r\n') + '\r\n', 'utf8');
console.log(
  `✔ variantes_u_en_corpus.csv: ${filas.length} palabras, ${filas.reduce((s, h) => s + h.veces, 0)} apariciones ` +
    `(vocabulario con ʉ: ${conU.size}; variantes que no son otra palabra: ${candidatas.size})`,
);
