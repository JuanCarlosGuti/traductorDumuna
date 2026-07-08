import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { ImportadorModule } from './importador/importador.module';
import { rutaDbPorDefecto } from './importador/rutas-datos';

@Module({
  imports: [
    DatabaseModule.forRoot({ rutaDb: rutaDbPorDefecto() }),
    ImportadorModule,
  ],
})
export class AppModule {}
