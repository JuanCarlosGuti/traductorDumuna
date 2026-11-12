export interface FragmentSegment {
  texto: string;
  esPalabra: boolean;
  resaltado: boolean;
}

const RE_PALABRA = /[\p{L}ʉ']+/gu;

function unescapeHtml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/**
 * Converts a concordance fragment from the backend (escaped text with
 * the matched word wrapped in <mark>) into renderable segments:
 * each word separately (to make it clickable) and the separators
 * between them. It also works for plain text (without <mark>).
 */
export function segmentFragment(fragmentHtml: string): FragmentSegment[] {
  const segments: FragmentSegment[] = [];
  let highlighted = false;
  for (const part of fragmentHtml.split(/(<\/?mark>)/)) {
    if (part === '<mark>') {
      highlighted = true;
      continue;
    }
    if (part === '</mark>') {
      highlighted = false;
      continue;
    }
    if (!part) continue;
    const text = unescapeHtml(part);
    let last = 0;
    for (const m of text.matchAll(RE_PALABRA)) {
      const startIndex = m.index ?? 0;
      if (startIndex > last) {
        segments.push({ texto: text.slice(last, startIndex), esPalabra: false, resaltado: highlighted });
      }
      segments.push({ texto: m[0], esPalabra: true, resaltado: highlighted });
      last = startIndex + m[0].length;
    }
    if (last < text.length) {
      segments.push({ texto: text.slice(last), esPalabra: false, resaltado: highlighted });
    }
  }
  return segments;
}
