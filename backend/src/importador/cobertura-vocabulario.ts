import { normalizar } from '../comun/texto/normalizador';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { alternativasEspanol, candidatosSingular } from '../consulta/diccionario';

export interface EntradaCubrible {
  espanol: string;
  damana: string;
}

/**
 * Which words does the vocabulary already know? Used to avoid asking the
 * speakers (who charge per word) for something the corpus already has: an unfilled
 * elicitation row whose palabra_es already exists is not recorded as
 * pending, and an open pending item that the vocabulary covers is closed.
 *
 * The comparison uses the same rules the translator uses to find a
 * word in the dictionary: alternatives on the Spanish side («Igual, lo
 * mismo», «Ese o esa», parentheses removed), no accents or capitals, and the
 * singular of the requested word (flores → flor). ʉ ≠ u and ñ ≠ n, as always.
 */
export class CoberturaVocabulario {
  private readonly espanol = new Set<string>();
  private readonly damana = new Set<string>();

  constructor(entradas: EntradaCubrible[]) {
    for (const e of entradas) {
      // What goes in parentheses also counts as an alternative:
      // «Territorio (tierra)» covers «tierra».
      const parentesis = [...e.espanol.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
      for (const texto of [e.espanol, ...parentesis]) {
        for (const alternativa of alternativasEspanol(texto)) {
          const clave = claveEspanol(alternativa);
          if (clave) this.espanol.add(clave);
        }
      }
      const dm = tokenizarDamana(e.damana).map((t) => t.normalizada).join(' ');
      if (dm) this.damana.add(dm);
    }
  }

  cubreEspanol(palabra: string): boolean {
    for (const alternativa of alternativasEspanol(palabra)) {
      const clave = claveEspanol(alternativa);
      if (!clave) continue;
      if (this.espanol.has(clave)) return true;
      // Single words only: «flores» → «flor»; a phrase is not singularized.
      if (!clave.includes(' ') && candidatosSingular(clave).some((s) => this.espanol.has(s))) return true;
    }
    return false;
  }

  cubreDamana(palabra: string): boolean {
    const clave = tokenizarDamana(palabra).map((t) => t.normalizada).join(' ');
    return clave.length > 0 && this.damana.has(clave);
  }

  cubre(palabra: string, idioma: 'espanol' | 'damana'): boolean {
    return idioma === 'espanol' ? this.cubreEspanol(palabra) : this.cubreDamana(palabra);
  }
}

function claveEspanol(alternativa: string): string {
  return normalizar(alternativa).replace(/\s+/g, ' ').trim();
}
