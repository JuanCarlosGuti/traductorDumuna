#!/usr/bin/env node
// Paso 2 de INSTRUCCIONES-CLAUDE-CODE.md: cruza el vocabulario externo con
// datos/corpus_vocabulario_v3.csv y escribe en material-externo/salida/:
//   vocabulario_nuevo.csv        (formato exacto del corpus: espanol,damana,categoria,notas,fuente)
//   divergencias_vocabulario.csv (misma palabra con otra grafía u otro significado)
//   coincidencias_vocabulario.csv (ya estaba: solo se anota la fuente)
// No toca /datos. Uso: node material-externo/herramientas/cruzar_vocabulario.js
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const { parse } = require(require.resolve('csv-parse/sync', { paths: [RAIZ, path.join(RAIZ, 'backend')] }));
const DIR = path.join(RAIZ, 'material-externo');
const SALIDA = path.join(DIR, 'salida');

// Misma normalización que backend/src/comun/texto/normalizador.ts, más ᵾ → ʉ.
function normalizar(texto) {
  return texto
    .replace(/ᵾ/g, 'ʉ')
    .replace(/ᵽ/g, 'Ʉ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/ñ/g, 'ñ')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}
// Solo para detectar grafías alternativas (u/ʉ, rr/r, w/u, y/i, h/j, dzh/dz…).
function esqueleto(texto) {
  return normalizar(texto)
    .replace(/ʉ/g, 'u')
    .replace(/rr/g, 'r')
    .replace(/dzh/g, 'dz')
    .replace(/tsh|ch/g, 'ts')
    .replace(/kw/g, 'ku')
    .replace(/gw/g, 'gu')
    .replace(/w/g, 'u')
    .replace(/y/g, 'i')
    .replace(/h/g, 'j')
    .replace(/kk/g, 'k')
    .replace(/\s+/g, ' ');
}
function alternativasEs(espanol) {
  return espanol
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^\s*\p{L}+:\s*/u, '')
    .replace(/\/[ao]s?\b/g, '')
    .split(/[,;/]|\s[–-]\s|\s[ou]\s/)
    .map((a) => normalizar(a.replace(/[¿?¡!."«»]/g, ' ')).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}
const leerCsv = (ruta) => parse(fs.readFileSync(ruta), { columns: true, bom: true, skip_empty_lines: true });
const campo = (v) => (/[",\n\r]/.test(v ?? '') ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
function escribirCsv(nombre, columnas, filas) {
  const lineas = [columnas.join(','), ...filas.map((f) => columnas.map((c) => campo(f[c])).join(','))];
  fs.writeFileSync(path.join(SALIDA, nombre), '﻿' + lineas.join('\r\n') + '\r\n', 'utf8');
}

// --- corpus ---
const corpus = leerCsv(path.join(RAIZ, 'datos', 'corpus_vocabulario_v3.csv'));
const porDm = new Map();
const porEs = new Map();
const porEsqDm = new Map();
const agregar = (m, k, v) => (m.has(k) ? m.get(k).push(v) : m.set(k, [v]));
for (const e of corpus) {
  agregar(porDm, normalizar(e.damana), e);
  agregar(porEsqDm, esqueleto(e.damana), e);
  for (const alt of alternativasEs(e.espanol)) agregar(porEs, alt, e);
}

// --- fuentes externas → entradas homogéneas ---
const CATEGORIA_LD = (cat, dominio, espanol) => {
  const d = dominio || '';
  if (/Numerals/.test(d)) return 'Números';
  if (cat === 'v') return 'Verbos';
  if (/Body parts/.test(d)) return 'Partes del cuerpo';
  if (/Kinship/.test(d)) return 'Personas y familia';
  if (/Animals|Birds|Insects|Reptiles/.test(d)) return 'Animales';
  if (/Colors/.test(d)) return 'Adjetivos';
  if (/Food, cooking/.test(d) && !/Plants/.test(d)) return 'Alimentos';
  if (/Plants, trees/.test(d)) return 'Plantas / árboles / frutos';
  if (/Household|Tools and weapons|Clothing|Art, crafts/.test(d)) return 'Casa / objetos / herramientas';
  if (/Sky, weather/.test(d)) return 'Tiempo / días / clima';
  if (/Earth, geology|Water, bodies|Universe|Location and Directions/.test(d)) return 'Naturaleza / geografía';
  if (/Spirituality/.test(d)) return 'Cultura / tradición / espiritualidad';
  if (/Emotions|Senses/.test(d)) return 'Sentimientos / estados';
  if (cat === 'adj') return 'Adjetivos';
  if (cat === 'prep') return 'Conectores / determinantes';
  if (/Social activities|Social Relations/.test(d)) return 'Reuniones';
  return 'Otros';
};
const limpiarLema = (dm) => (/^[A-ZƱ]/.test(dm) && !/^[A-Z][a-z]+ [A-Z]/.test(dm) ? dm[0].toLowerCase() + dm.slice(1) : dm);

// Errores evidentes del Living Dictionary (columnas cruzadas o erratas del
// español). Se corrige la glosa y se deja constancia en la nota; la palabra
// damana no se toca.
const CORRECCIONES_LD = {
  'Amʉsi|to feel': 'sentir',
  'ʉnkanguashakuaga|pillow': 'almohada',
  'Kazhia|fumo': 'humo',
  'Zhama|vegetale': 'vegetal',
  'Duga|Hermando menor': 'hermano menor',
  'Shamunkumba|kobija / manta': 'cobija / manta',
  'Widanka|muerto/a': 'muerte',
};

const externas = [];
const ld = leerCsv(path.join(DIR, 'Damana - Living Dictionary (209 entradas).csv'));
for (const f of ld) {
  if (!f.damana || !f.espanol) continue;
  const corregido = CORRECCIONES_LD[`${f.damana.trim()}|${f.espanol.trim()}`];
  const avisoIngles =
    /read/.test(f.ingles || '') && /escribir/.test(f.espanol) ? '; OJO: el inglés dice «to read» (leer)' : '';
  externas.push({
    fuente: 'Living Dictionary 2026',
    ref: f.url,
    damana: limpiarLema(f.damana.trim()),
    damanaOriginal: f.damana.trim(),
    espanol: corregido ?? f.espanol.trim(),
    categoria: CATEGORIA_LD(f.categoria, f.dominio_semantico, f.espanol),
    nota: `LD: ${f.categoria || '?'}; ${f.ingles || ''}${corregido ? `; la fuente dice «${f.espanol.trim()}» (corregido)` : ''}${avisoIngles}`.trim(),
    confianza: 'alta',
  });
}
for (const f of leerCsv(path.join(SALIDA, 'fuentes', 'hoppe1974_glosario.csv'))) {
  externas.push({
    fuente: 'Hoppe 1974 (La culebra, glosario)',
    ref: 'colombia.sil.org/resources/archives/19081 pp. 374-381',
    damana: f.damana_convertido,
    damanaOriginal: f.damana_ilv,
    espanol: f.espanol,
    categoria: 'Otros',
    nota: `ortografía ILV 1974 «${f.damana_ilv}» convertida${f.nota ? '; ' + f.nota : ''}`,
    confianza: /\[\?\]/.test(f.nota || '') ? 'baja' : 'media',
  });
}
for (const f of leerCsv(path.join(SALIDA, 'fuentes', 'hoppe1973_terminos.csv'))) {
  externas.push({
    fuente: 'Hoppe 1973 (cultura material)',
    ref: 'colombia.sil.org/resources/archives/18972',
    damana: f.damana_convertido,
    damanaOriginal: f.damana_ilv,
    espanol: f.espanol,
    categoria: 'Casa / objetos / herramientas',
    nota: `ortografía ILV 1973 «${f.damana_ilv}»${f.nota ? '; ' + f.nota : ''}`,
    confianza: 'media',
  });
}
for (const f of leerCsv(path.join(SALIDA, 'fuentes', 'swadesh1990_legible.csv'))) {
  externas.push({
    fuente: 'Swadesh SIL 1990',
    ref: `sil.org/resources/archives/84053 n.º ${f.numero}`,
    damana: f.damana_propuesto,
    damanaOriginal: f.ocr,
    espanol: f.espanol,
    categoria: 'Otros',
    nota: `transcripción fonética 1990 (OCR «${f.ocr}»)${f.nota ? '; ' + f.nota : ''}`,
    confianza: f.confianza,
  });
}

// --- clasificación ---
const nuevas = [];
const divergencias = [];
const coincidencias = [];
const vistasNuevas = new Set();
for (const x of externas) {
  const dmN = normalizar(x.damana);
  const altsX = alternativasEs(x.espanol);
  const mismasDm = porDm.get(dmN) ?? [];
  const mismasEs = [...new Set(altsX.flatMap((a) => porEs.get(a) ?? []))];
  const ambas = mismasDm.filter((e) => mismasEs.includes(e));
  const fuente = `${x.fuente} ${x.ref}`.trim();

  if (ambas.length > 0) {
    coincidencias.push({ espanol: x.espanol, damana: x.damana, espanol_corpus: ambas[0].espanol, damana_corpus: ambas[0].damana, fuente_externa: fuente });
    continue;
  }
  // Una fila por entrada externa y tipo: las formas del corpus van juntas,
  // separadas por « | », para que el revisor vea todo de una vez.
  const divergencia = (entradas, tipo, propuesta) =>
    divergencias.push({
      damana_corpus: [...new Set(entradas.map((e) => e.damana))].join(' | '),
      damana_fuente: x.damanaOriginal,
      espanol_corpus: [...new Set(entradas.map((e) => e.espanol))].join(' | '),
      espanol_fuente: x.espanol,
      fuente,
      tipo_divergencia: tipo,
      propuesta,
    });
  if (mismasDm.length > 0) {
    divergencia(mismasDm, 'misma forma damana, otro significado',
      'preguntar a la hablante si son dos sentidos de la misma palabra o dos palabras');
    continue;
  }
  if (mismasEs.length > 0) {
    const esq = esqueleto(x.damana);
    const variantes = mismasEs.filter((e) => esqueleto(e.damana) === esq);
    const otras = mismasEs.filter((e) => esqueleto(e.damana) !== esq);
    if (variantes.length) {
      divergencia(variantes, 'mismo significado, otra grafía',
        'fijar una grafía con el revisor (el corpus usa la primera columna)');
    }
    if (otras.length) {
      divergencia(otras, 'mismo significado, otra palabra',
        'preguntar si son sinónimos, registro distinto o error de una de las fuentes');
    }
    continue;
  }
  const parecidas = porEsqDm.get(esqueleto(x.damana)) ?? [];
  if (parecidas.length > 0) {
    divergencia(parecidas, 'grafía parecida, significado distinto', 'confirmar si es la misma palabra');
    continue;
  }
  const clave = `${normalizar(x.espanol)}|${dmN}`;
  if (vistasNuevas.has(clave)) continue;
  vistasNuevas.add(clave);
  nuevas.push({
    espanol: x.espanol,
    damana: x.damana,
    categoria: x.categoria,
    notas: `${x.nota}; confianza ${x.confianza}; POR CONFIRMAR CON HABLANTE`,
    fuente,
    _confianza: x.confianza,
  });
}

const orden = { alta: 0, media: 1, baja: 2 };
nuevas.sort((a, b) => orden[a._confianza] - orden[b._confianza] || a.espanol.localeCompare(b.espanol, 'es'));
escribirCsv('vocabulario_nuevo.csv', ['espanol', 'damana', 'categoria', 'notas', 'fuente'], nuevas);
escribirCsv('divergencias_vocabulario.csv', ['damana_corpus', 'damana_fuente', 'espanol_corpus', 'espanol_fuente', 'fuente', 'tipo_divergencia', 'propuesta'], divergencias);
escribirCsv('coincidencias_vocabulario.csv', ['espanol', 'damana', 'espanol_corpus', 'damana_corpus', 'fuente_externa'], coincidencias);

// --- resumen ---
const porFuente = (lista, clave) => {
  const m = new Map();
  for (const f of lista) {
    const k = (f[clave] || '').split(' (')[0].split(' sil.org')[0].split(' colombia')[0].split(' https')[0];
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].map(([k, v]) => `${k}: ${v}`).join(' · ');
};
console.log(`Corpus: ${corpus.length} entradas. Externas leídas: ${externas.length}.`);
console.log(`COINCIDEN: ${coincidencias.length}  (${porFuente(coincidencias, 'fuente_externa')})`);
console.log(`DIVERGEN:  ${divergencias.length}  (${porFuente(divergencias, 'fuente')})`);
const tipos = new Map();
for (const d of divergencias) tipos.set(d.tipo_divergencia, (tipos.get(d.tipo_divergencia) ?? 0) + 1);
for (const [t, n] of tipos) console.log(`   - ${t}: ${n}`);
console.log(`NUEVAS:    ${nuevas.length}  (${porFuente(nuevas, 'fuente')})`);
const conf = new Map();
for (const n of nuevas) conf.set(n._confianza, (conf.get(n._confianza) ?? 0) + 1);
console.log(`   por confianza: ${[...conf].map(([k, v]) => `${k} ${v}`).join(', ')}`);
