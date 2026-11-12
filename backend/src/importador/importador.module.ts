import { Module } from '@nestjs/common';
import { PendientesModule } from '../pendientes/pendientes.module';
import { ImportadorService } from './importador.service';

// PendientesModule: unfilled elicitation rows are recorded as
// pending and those that come back complete close theirs.
@Module({
  imports: [PendientesModule],
  providers: [ImportadorService],
  exports: [ImportadorService],
})
export class ImportadorModule {}
