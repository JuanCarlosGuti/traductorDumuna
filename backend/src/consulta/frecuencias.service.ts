import { Injectable } from '@nestjs/common';
import { normalizar } from '../comun/texto/normalizador';
import { CorpusRepository } from './corpus.repository';
import { FrecuenciaDto } from './dto/consulta.dto';

// La comparación de mayúsculas se hace en JS y no en SQL porque lower()
// de SQLite solo maneja ASCII (fallaría con Ñ, Ʉ o vocales con tilde).
function empiezaEnMinuscula(palabra: string): boolean {
  const c = palabra[0] ?? '';
  return c === c.toLowerCase() && c !== c.toUpperCase();
}

@Injectable()
export class FrecuenciasService {
  constructor(private readonly repo: CorpusRepository) {}

  /**
   * Palabras damana por frecuencia descendente, excluyendo probables
   * nombres propios (tokens que en los originales solo aparecen con
   * mayúscula inicial). Si la palabra coincide con una entrada de
   * vocabulario lleva su traducción y categoría; si es una forma
   * conjugada, su glosa.
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
    // Glosas de conjugación como respaldo cuando no hay entrada de vocabulario
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
