import { Module } from '@nestjs/common';
import { ConsultaModule } from '../consulta/consulta.module';
import { PendientesModule } from '../pendientes/pendientes.module';
import { clienteAnthropicProvider } from './anthropic.provider';
import { configTraductorProvider } from './config-traductor.provider';
import { TraduccionController } from './traduccion.controller';
import { TraduccionService } from './traduccion.service';
import { TraduccionesRepository } from './traducciones.repository';
import { ValidadasRepository } from './validadas.repository';

@Module({
  imports: [ConsultaModule, PendientesModule],
  controllers: [TraduccionController],
  providers: [
    clienteAnthropicProvider,
    configTraductorProvider,
    TraduccionService,
    TraduccionesRepository,
    ValidadasRepository,
  ],
  exports: [TraduccionService],
})
export class TraduccionModule {}
