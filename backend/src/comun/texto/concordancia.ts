import { normalizar } from './normalizador';

export interface Ocurrencia {
  inicio: number;
  fin: number;
  palabra: string;
}

const RE_PALABRA = /[\p{L}ʉ']+/gu;

/**
 * Encuentra todas las ocurrencias de una palabra en un texto, comparando
 * en forma normalizada (sin tildes ni mayúsculas, conservando ʉ y ñ).
 * Los índices refieren al texto original. Los apóstrofes de borde se
 * recortan igual que en tokenizarDamana.
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
 * Extrae el fragmento de contexto de una ocurrencia: ±radio caracteres a
 * cada lado, cortando en límite de palabra (nunca por la mitad), con la
 * palabra encontrada envuelta en <mark>. Los recortes se señalan con «…»
 * y los saltos de línea internos se colapsan a un espacio. El resto del
 * fragmento va escapado como HTML.
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
