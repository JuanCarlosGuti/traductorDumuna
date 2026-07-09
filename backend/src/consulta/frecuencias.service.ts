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
   * vocabulario, lleva su categoría.
   */
  listar(limite: number): FrecuenciaDto[] {
    const categorias = new Map<string, string>();
    for (const entrada of this.repo.listarVocabulario()) {
      if (entrada.categoria) {
        const clave = normalizar(entrada.damana);
        if (!categorias.has(clave)) categorias.set(clave, entrada.categoria);
      }
    }

    return this.repo
      .frecuenciasConOriginales()
      .filter((f) => f.originales.some(empiezaEnMinuscula))
      .slice(0, limite)
      .map((f) => ({
        palabra: f.palabra,
        frecuencia: f.frecuencia,
        categoria: categorias.get(f.palabra) ?? null,
      }));
  }
}
