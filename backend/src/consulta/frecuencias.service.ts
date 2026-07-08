import { Injectable } from '@nestjs/common';
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
   * nombres propios: tokens que en los originales solo aparecen con
   * mayúscula inicial.
   */
  listar(limite: number): FrecuenciaDto[] {
    return this.repo
      .frecuenciasConOriginales()
      .filter((f) => f.originales.some(empiezaEnMinuscula))
      .slice(0, limite)
      .map((f) => ({ palabra: f.palabra, frecuencia: f.frecuencia }));
  }
}
