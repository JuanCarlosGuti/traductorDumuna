import { normalizar } from '../comun/texto/normalizador';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { alternativasEspanol, candidatosSingular } from '../consulta/diccionario';

export interface EntradaCubrible {
  espanol: string;
  damana: string;
}

/**
 * ¿Qué palabras ya sabe el vocabulario? Sirve para no pedirles a las
 * hablantes (que cobran por palabra) algo que el corpus ya tiene: una fila
 * de elicitación sin llenar cuya palabra_es ya existe no se registra como
 * pendiente, y una pendiente abierta que el vocabulario cubre se cierra.
 *
 * Se compara con las mismas reglas que usa el traductor para encontrar una
 * palabra en el diccionario: alternativas del lado español («Igual, lo
 * mismo», «Ese o esa», paréntesis fuera), sin tildes ni mayúsculas, y el
 * singular de la palabra pedida (flores → flor). ʉ ≠ u y ñ ≠ n, como siempre.
 */
export class CoberturaVocabulario {
  private readonly espanol = new Set<string>();
  private readonly damana = new Set<string>();

  constructor(entradas: EntradaCubrible[]) {
    for (const e of entradas) {
      // Lo que va entre paréntesis también cuenta como alternativa:
      // «Territorio (tierra)» cubre «tierra».
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
      // Solo palabras sueltas: «flores» → «flor»; una frase no se singulariza.
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
