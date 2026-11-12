import { Module } from '@nestjs/common';
import { QueryModule } from '../consulta/consulta.module';
import { PendingModule } from '../pendientes/pendientes.module';
import { anthropicClientProvider } from './anthropic.provider';
import { translatorConfigProvider } from './config-traductor.provider';
import { TranslationController } from './traduccion.controller';
import { TranslationService } from './traduccion.service';
import { TranslationsRepository } from './traducciones.repository';
import { ValidatedRepository } from './validadas.repository';

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
