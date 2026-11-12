import { Injectable } from '@nestjs/common';
import { normalizar } from '../comun/texto/normalizador';
import { CorpusRepository } from './corpus.repository';
import { FrecuenciaDto } from './dto/consulta.dto';

// The capitalization comparison is done in JS and not in SQL because SQLite's
// lower() only handles ASCII (it would fail with Ñ, Ʉ or accented vowels).
function empiezaEnMinuscula(palabra: string): boolean {
  const c = palabra[0] ?? '';
  return c === c.toLowerCase() && c !== c.toUpperCase();
}

@Injectable()
export class FrecuenciasService {
  constructor(private readonly repo: CorpusRepository) {}

  /**
   * Damana words by descending frequency, excluding probable
   * proper names (tokens that in the originals only appear with
   * an initial capital). If the word matches a vocabulary
   * entry it carries its translation and category; if it is a conjugated
   * form, its gloss.
   */
  listar(limite: number): FrecuenciaDto[] {
    const categorias = new Map<string, string>();
    const traducciones = new Map<string, string>();
    for (const entrada of this.repo.listarVocabulario()) {
      const clave = normalizar(entrada.damana);
      if (entrada.categoria && !categorias.has(clave)) {
        categorias.set(clave, entrada.categoria);
      }
      if (!traducciones.has(clave)) traducciones.set(clave, entrada.espanol);
    }
    // Conjugation glosses as a fallback when there is no vocabulary entry
    for (const conjugacion of this.repo.listarConjugaciones()) {
      const clave = normalizar(conjugacion.damana);
      if (!traducciones.has(clave)) traducciones.set(clave, conjugacion.espanol);
    }

    return this.repo
      .frecuenciasConOriginales()
      .filter((f) => f.originales.some(empiezaEnMinuscula))
      .slice(0, limite)
      .map((f) => ({
        palabra: f.palabra,
        frecuencia: f.frecuencia,
        traduccion: traducciones.get(f.palabra) ?? null,
        categoria: categorias.get(f.palabra) ?? null,
      }));
  }
}
