import { Module } from '@nestjs/common';
import { PendingController } from './pending.controller';
import { PendingRepository } from './pending.repository';
import { PendingService } from './pending.service';

@Module({
  controllers: [PendingController],
  providers: [PendingRepository, PendingService],
  exports: [PendingRepository],
})
export class PendingModule {}
