import { Module } from '@nestjs/common';
import { QueryModule } from '../query/query.module';
import { TranslationsRepository } from '../translation/translations.repository';
import { MissingWordsService } from './missing-words.service';

@Module({
  imports: [QueryModule],
  providers: [MissingWordsService, TranslationsRepository],
  exports: [MissingWordsService],
})
export class MissingWordsModule {}
