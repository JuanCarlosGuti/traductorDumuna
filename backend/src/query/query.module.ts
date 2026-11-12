import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { QueryController } from './query.controller';
import { CorpusRepository } from './corpus.repository';
import { FrequenciesService } from './frequencies.service';
import { GrammarController } from './grammar.controller';
import { GrammarService } from './grammar.service';
import { WordService } from './word.service';
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
