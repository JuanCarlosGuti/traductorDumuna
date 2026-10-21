import { Module } from '@nestjs/common';
import { PendientesController } from './pendientes.controller';
import { PendientesRepository } from './pendientes.repository';
import { PendientesService } from './pendientes.service';

@Module({
  controllers: [PendientesController],
  providers: [PendientesRepository, PendientesService],
  exports: [PendientesRepository],
})
export class PendientesModule {}
