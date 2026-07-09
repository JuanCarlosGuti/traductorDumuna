import { Injectable, NotFoundException } from '@nestjs/common';
import { CorpusRepository } from './corpus.repository';
import { LemaDto, TablaConjugacionDto } from './dto/consulta.dto';

@Injectable()
export class GramaticaService {
  constructor(private readonly repo: CorpusRepository) {}

  lemas(): LemaDto[] {
    return this.repo.listarLemas();
  }

  tablaDe(lema: string): TablaConjugacionDto {
    const conjugaciones = this.repo.conjugacionesDe(lema);
    if (conjugaciones.length === 0) {
      throw new NotFoundException(`No hay conjugaciones para el lema "${lema}"`);
    }
    return { lema, conjugaciones };
  }
}
