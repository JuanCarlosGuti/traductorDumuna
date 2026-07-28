import { Module } from '@nestjs/common';
import { ConsultaModule } from '../consulta/consulta.module';
import { TraduccionesRepository } from '../traduccion/traducciones.repository';
import { NecesitoService } from './necesito.service';

@Module({
  imports: [ConsultaModule],
  providers: [NecesitoService, TraduccionesRepository],
  exports: [NecesitoService],
})
export class NecesitoModule {}
