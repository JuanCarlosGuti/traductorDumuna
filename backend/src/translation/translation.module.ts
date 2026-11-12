import { Module } from '@nestjs/common';
import { QueryModule } from '../query/query.module';
import { PendingModule } from '../pending/pending.module';
import { anthropicClientProvider } from './anthropic.provider';
import { translatorConfigProvider } from './translator-config.provider';
import { TranslationController } from './translation.controller';
import { TranslationService } from './translation.service';
import { TranslationsRepository } from './translations.repository';
import { ValidatedRepository } from './validated.repository';

@Module({
  imports: [QueryModule, PendingModule],
  controllers: [TranslationController],
  providers: [
    anthropicClientProvider,
    translatorConfigProvider,
    TranslationService,
    TranslationsRepository,
    ValidatedRepository,
  ],
  exports: [TranslationService],
})
export class TranslationModule {}
