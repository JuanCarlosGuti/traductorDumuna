import { Module } from '@nestjs/common';
import { ConsultaModule } from './consulta/consulta.module';
import { DatabaseModule } from './database/database.module';
import { ImportadorModule } from './importador/importador.module';
import { rutaDbPorDefecto } from './importador/rutas-datos';

@Module({
  imports: [
    DatabaseModule.forRoot({ rutaDb: rutaDbPorDefecto() }),
    ImportadorModule,
    ConsultaModule,
  ],
})
export class AppModule {}
