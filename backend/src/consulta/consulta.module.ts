import { Module } from '@nestjs/common';
import { SearchService } from './busqueda.service';
import { QueryController } from './consulta.controller';
import { CorpusRepository } from './corpus.repository';
import { FrequenciesService } from './frecuencias.service';
import { GrammarController } from './gramatica.controller';
import { GrammarService } from './gramatica.service';
import { WordService } from './palabra.service';
import { RetrievalService } from './retrieval.service';

@Module({
  controllers: [QueryController, GrammarController],
  providers: [
    CorpusRepository,
    SearchService,
    WordService,
    FrequenciesService,
    GrammarService,
    RetrievalService,
  ],
  exports: [CorpusRepository, WordService, FrequenciesService, RetrievalService],
})
export class QueryModule {}
