import { Module } from '@nestjs/common';
import { PendingModule } from '../pending/pending.module';
import { ImporterService } from './importer.service';

// PendingModule: unfilled elicitation rows are recorded as
// pending and those that come back complete close theirs.
@Module({
  imports: [PendingModule],
  providers: [ImporterService],
  exports: [ImporterService],
})
export class ImporterModule {}
