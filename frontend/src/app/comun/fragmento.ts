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
 * Converts a concordance fragment from the backend (escaped text with
 * the matched word wrapped in <mark>) into renderable segments:
 * each word separately (to make it clickable) and the separators
 * between them. It also works for plain text (without <mark>).
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
