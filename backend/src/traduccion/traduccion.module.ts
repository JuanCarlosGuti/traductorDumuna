import { Module } from '@nestjs/common';
import { ConsultaModule } from '../consulta/consulta.module';
import { clienteAnthropicProvider } from './anthropic.provider';
import { configTraductorProvider } from './config-traductor.provider';
import { TraduccionController } from './traduccion.controller';
import { TraduccionService } from './traduccion.service';
import { TraduccionesRepository } from './traducciones.repository';

@Module({
  imports: [ConsultaModule],
  controllers: [TraduccionController],
  providers: [
    clienteAnthropicProvider,
    configTraductorProvider,
    TraduccionService,
    TraduccionesRepository,
  ],
})
export class TraduccionModule {}
