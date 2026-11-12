import { Module } from '@nestjs/common';
import { PendingController } from './pendientes.controller';
import { PendingRepository } from './pendientes.repository';
import { PendingService } from './pendientes.service';

@Module({
  controllers: [PendingController],
  providers: [PendingRepository, PendingService],
  exports: [PendingRepository],
})
export class PendingModule {}
