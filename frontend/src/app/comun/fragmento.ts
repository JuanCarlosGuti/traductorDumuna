export interface SegmentoFragmento {
  texto: string;
  esPalabra: boolean;
  resaltado: boolean;
}

const RE_PALABRA = /[\p{L}ʉ']+/gu;

function desescaparHtml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/**
 * Convierte un fragmento de concordancia del backend (texto escapado con
 * la palabra encontrada envuelta en <mark>) en segmentos renderizables:
 * cada palabra por separado (para hacerla clicable) y los separadores
 * entre ellas. También sirve para texto plano (sin <mark>).
 */
export function segmentarFragmento(fragmentoHtml: string): SegmentoFragmento[] {
  const segmentos: SegmentoFragmento[] = [];
  let resaltado = false;
  for (const parte of fragmentoHtml.split(/(<\/?mark>)/)) {
    if (parte === '<mark>') {
      resaltado = true;
      continue;
    }
    if (parte === '</mark>') {
      resaltado = false;
      continue;
    }
    if (!parte) continue;
    const texto = desescaparHtml(parte);
    let ultimo = 0;
    for (const m of texto.matchAll(RE_PALABRA)) {
      const inicio = m.index ?? 0;
      if (inicio > ultimo) {
        segmentos.push({ texto: texto.slice(ultimo, inicio), esPalabra: false, resaltado });
      }
      segmentos.push({ texto: m[0], esPalabra: true, resaltado });
      ultimo = inicio + m[0].length;
    }
    if (ultimo < texto.length) {
      segmentos.push({ texto: texto.slice(ultimo), esPalabra: false, resaltado });
    }
  }
  return segmentos;
}
