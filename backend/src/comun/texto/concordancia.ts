import { normalizar } from './normalizador';

export interface Ocurrencia {
  inicio: number;
  fin: number;
  palabra: string;
}

const RE_PALABRA = /[\p{L}ʉ']+/gu;

/**
 * Finds every occurrence of a word in a text, comparing
 * in normalized form (no accents or capitals, keeping ʉ and ñ).
 * Indexes refer to the original text. Edge apostrophes are
 * trimmed the same way as in tokenizarDamana.
 */
export function buscarOcurrencias(texto: string, consulta: string): Ocurrencia[] {
  const objetivo = normalizar(consulta.trim());
  if (objetivo.length === 0) return [];

  const ocurrencias: Ocurrencia[] = [];
  for (const m of texto.matchAll(RE_PALABRA)) {
    const bruta = m[0];
    const sinIzquierda = bruta.replace(/^'+/, '');
    const palabra = sinIzquierda.replace(/'+$/, '');
    if (palabra.length === 0) continue;
    const inicio = (m.index ?? 0) + (bruta.length - sinIzquierda.length);
    if (normalizar(palabra) === objetivo) {
      ocurrencias.push({ inicio, fin: inicio + palabra.length, palabra });
    }
  }
  return ocurrencias;
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function limpiarEspacios(s: string): string {
  return s.replace(/\s+/g, ' ');
}

/**
 * Marks ALL the given occurrences in a full text with <mark>,
 * escaping the rest as HTML and collapsing line breaks. Meant
 * for short texts (sentences, phrases) where there is no need to trim
 * context. Overlapping occurrences are ignored.
 */
export function marcarOcurrencias(texto: string, ocurrencias: Ocurrencia[]): string {
  const ordenadas = [...ocurrencias].sort((a, b) => a.inicio - b.inicio);
  let resultado = '';
  let posicion = 0;
  for (const oc of ordenadas) {
    if (oc.inicio < posicion) continue;
    resultado += escaparHtml(limpiarEspacios(texto.slice(posicion, oc.inicio)));
    resultado += '<mark>' + escaparHtml(texto.slice(oc.inicio, oc.fin)) + '</mark>';
    posicion = oc.fin;
  }
  resultado += escaparHtml(limpiarEspacios(texto.slice(posicion)));
  return resultado;
}

/**
 * Extracts the context fragment for an occurrence: ±radio characters on
 * each side, cutting at a word boundary (never mid-word), with the
 * matched word wrapped in <mark>. Cuts are signalled with «…»
 * and internal line breaks are collapsed to a space. The rest of the
 * fragment is HTML-escaped.
 */
export function extraerFragmento(
  texto: string,
  ocurrencia: Ocurrencia,
  radio = 120,
): string {
  let ini = Math.max(0, ocurrencia.inicio - radio);
  if (ini > 0 && !/\s/.test(texto[ini - 1])) {
    const primerEspacio = texto.slice(ini, ocurrencia.inicio).search(/\s/);
    ini = primerEspacio === -1 ? ini : ini + primerEspacio + 1;
  }

  let fin = Math.min(texto.length, ocurrencia.fin + radio);
  if (fin < texto.length && !/\s/.test(texto[fin])) {
    const cola = texto.slice(ocurrencia.fin, fin);
    const ultimoEspacio = cola.search(/\s\S*$/);
    fin = ultimoEspacio === -1 ? fin : ocurrencia.fin + ultimoEspacio;
  }

  const antes = limpiarEspacios(texto.slice(ini, ocurrencia.inicio));
  const palabra = texto.slice(ocurrencia.inicio, ocurrencia.fin);
  const despues = limpiarEspacios(texto.slice(ocurrencia.fin, fin));

  return (
    (ini > 0 ? '…' : '') +
    escaparHtml(antes) +
    '<mark>' +
    escaparHtml(palabra) +
    '</mark>' +
    escaparHtml(despues) +
    (fin < texto.length ? '…' : '')
  );
}
