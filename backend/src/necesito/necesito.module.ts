import { Module } from '@nestjs/common';
import { QueryModule } from '../consulta/consulta.module';
import { TranslationsRepository } from '../traduccion/traducciones.repository';
import { MissingWordsService } from './necesito.service';

@Module({
  imports: [QueryModule],
  providers: [MissingWordsService, TranslationsRepository],
  exports: [MissingWordsService],
})
export class MissingWordsModule {}
