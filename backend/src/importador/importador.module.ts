import { Module } from '@nestjs/common';
import { ImportadorService } from './importador.service';

@Module({
  providers: [ImportadorService],
  exports: [ImportadorService],
})
export class ImportadorModule {}
