import { Module } from '@nestjs/common';
import { PendientesModule } from '../pendientes/pendientes.module';
import { ImportadorService } from './importador.service';

// PendientesModule: las filas de elicitación sin llenar se apuntan como
// pendientes y las que vuelven completas cierran la suya.
@Module({
  imports: [PendientesModule],
  providers: [ImportadorService],
  exports: [ImportadorService],
})
export class ImportadorModule {}
