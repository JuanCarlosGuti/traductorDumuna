import { Module } from '@nestjs/common';
import { ConsultaModule } from '../consulta/consulta.module';
import { clienteAnthropicProvider } from './anthropic.provider';
import { configTraductorProvider } from './config-traductor.provider';
import { TraduccionController } from './traduccion.controller';
import { TraduccionService } from './traduccion.service';

@Module({
  imports: [ConsultaModule],
  controllers: [TraduccionController],
  providers: [clienteAnthropicProvider, configTraductorProvider, TraduccionService],
})
export class TraduccionModule {}
