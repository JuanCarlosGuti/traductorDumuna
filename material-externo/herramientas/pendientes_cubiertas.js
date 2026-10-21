#!/usr/bin/env node
// ¿Cuántas pendientes (palabras españolas sin damana, del lote 1 y del
// traductor) quedarían resueltas con el material externo? Lee la tabla
// pendientes de datos/corpus.db y la cruza con vocabulario_nuevo.csv (lo que
// se añadiría) y con el vocabulario actual del corpus (por si la pendiente ya
// estaba cubierta). Escribe material-externo/salida/pendientes_cubiertas.csv.
// No toca nada. Uso: node material-externo/herramientas/pendientes_cubiertas.js
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const resolver = (m) => require(require.resolve(m, { paths: [RAIZ, path.join(RAIZ, 'backend')] }));
const { parse } = resolver('csv-parse/sync');
const Database = resolver('better-sqlite3');
const SALIDA = path.join(RAIZ, 'material-externo', 'salida');

const normalizar = (s) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/ñ/g, 'ñ').replace(/[̀-ͯ]/g, '').trim();
const alternativas = (es) =>
  [es.replace(/\([^)]*\)/g, ' '), ...[...es.matchAll(/\(([^)]*)\)/g)].map((m) => m[1])]
    .join(',')
    .replace(/^\s*\p{L}+:\s*/u, '')
    .replace(/\/[ao]s?\b/g, '')
    .split(/[,;/]|\s[–-]\s|\s[ou]\s/)
    .map((a) => normalizar(a.replace(/[¿?¡!."«»]/g, ' ')).replace(/^(de |del |el |la |los |las |un |una |al )+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
const singular = (p) => p.replace(/(?<=\p{L}{3})es$/u, '').replace(/(?<=\p{L}{3})s$/u, '');
const claves = (es) => {
  const out = new Set();
  for (const a of alternativas(es)) {
    out.add(a);
    out.add(singular(a));
  }
  return [...out];
};
const leerCsv = (ruta) => parse(fs.readFileSync(ruta), { columns: true, bom: true, skip_empty_lines: true });
const campo = (v) => (/[",\n\r]/.test(v ?? '') ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));

const db = new Database(path.join(RAIZ, 'datos', 'corpus.db'), { readonly: true });
const pendientes = db
  .prepare("SELECT palabra, idioma, origen, veces_pedida, estado FROM pendientes WHERE estado <> 'resuelta' AND idioma = 'espanol' ORDER BY veces_pedida DESC, palabra")
  .all();
db.close();

const indexar = (filas, campoEs, campoDm, etiqueta) => {
  const m = new Map();
  for (const f of filas) {
    for (const k of claves(f[campoEs])) {
      if (!m.has(k)) m.set(k, []);
      m.get(k).push({ espanol: f[campoEs], damana: f[campoDm], fuente: etiqueta(f) });
    }
  }
  return m;
};
const nuevas = indexar(leerCsv(path.join(SALIDA, 'vocabulario_nuevo.csv')), 'espanol', 'damana', (f) => `NUEVA · ${f.fuente.split(' ').slice(0, 2).join(' ')} · ${/confianza alta/.test(f.notas) ? 'alta' : 'media'}`);
const corpus = indexar(leerCsv(path.join(RAIZ, 'datos', 'corpus_vocabulario_v3.csv')), 'espanol', 'damana', (f) => `ya en el corpus · ${f.fuente}`);

const filas = [];
let porNuevas = 0, porCorpus = 0;
for (const p of pendientes) {
  const ks = claves(p.palabra);
  const enNuevas = [...new Set(ks.flatMap((k) => nuevas.get(k) ?? []))];
  const enCorpus = [...new Set(ks.flatMap((k) => corpus.get(k) ?? []))];
  if (enNuevas.length === 0 && enCorpus.length === 0) continue;
  if (enNuevas.length) porNuevas += 1;
  else porCorpus += 1;
  const mejor = enNuevas[0] ?? enCorpus[0];
  filas.push({
    pendiente: p.palabra,
    origen: p.origen,
    veces_pedida: p.veces_pedida,
    damana_propuesto: [...new Set([...enNuevas, ...enCorpus].map((e) => e.damana))].join(' | '),
    espanol_fuente: [...new Set([...enNuevas, ...enCorpus].map((e) => e.espanol))].join(' | '),
    donde: [...new Set([...enNuevas, ...enCorpus].map((e) => e.fuente))].join(' | '),
    cubierta_por: enNuevas.length ? 'material externo (al cargarlo)' : 'el corpus actual',
    _mejor: mejor,
  });
}
const columnas = ['pendiente', 'origen', 'veces_pedida', 'damana_propuesto', 'espanol_fuente', 'donde', 'cubierta_por'];
fs.writeFileSync(
  path.join(SALIDA, 'pendientes_cubiertas.csv'),
  '﻿' + [columnas.join(','), ...filas.map((f) => columnas.map((c) => campo(f[c])).join(','))].join('\r\n') + '\r\n',
  'utf8',
);
console.log(`Pendientes abiertas en español: ${pendientes.length} (lote 1 y traductor).`);
console.log(`Cubiertas por el material externo al cargarlo: ${porNuevas}`);
console.log(`Ya cubiertas por el vocabulario actual (la pendiente sobra): ${porCorpus}`);
console.log(`Siguen sin nada: ${pendientes.length - porNuevas - porCorpus}`);
console.log('✔ material-externo/salida/pendientes_cubiertas.csv');
console.log('--- cubiertas por el material externo ---');
for (const f of filas.filter((f) => f.cubierta_por.startsWith('material'))) console.log(`  ${f.pendiente} → ${f.damana_propuesto}  [${f.donde}]`);
