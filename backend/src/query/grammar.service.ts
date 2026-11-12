import { Injectable, NotFoundException } from '@nestjs/common';
import { CorpusRepository } from './corpus.repository';
import { LemmaDto, ConjugationTableDto } from './dto/query.dto';

@Injectable()
export class GrammarService {
  constructor(private readonly repo: CorpusRepository) {}

  lemmas(): LemmaDto[] {
    return this.repo.listLemmas();
  }

  tableOf(lemma: string): ConjugationTableDto {
    const conjugations = this.repo.conjugationsOf(lemma);
    if (conjugations.length === 0) {
      throw new NotFoundException(`No hay conjugaciones para el lema "${lemma}"`);
    }
    return { lemma: lemma, conjugations: conjugations };
  }
}
