import { Module } from '@nestjs/common';
import { PendingModule } from '../pendientes/pendientes.module';
import { ImporterService } from './importador.service';

// PendingModule: unfilled elicitation rows are recorded as
// pending and those that come back complete close theirs.
@Module({
  imports: [PendingModule],
  providers: [ImporterService],
  exports: [ImporterService],
})
export class ImporterModule {}
