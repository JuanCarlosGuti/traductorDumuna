import { Module } from '@nestjs/common';
import { BusquedaService } from './busqueda.service';
import { ConsultaController } from './consulta.controller';
import { CorpusRepository } from './corpus.repository';
import { FrecuenciasService } from './frecuencias.service';
import { PalabraService } from './palabra.service';

@Module({
  controllers: [ConsultaController],
  providers: [CorpusRepository, BusquedaService, PalabraService, FrecuenciasService],
  exports: [CorpusRepository, PalabraService, FrecuenciasService],
})
export class ConsultaModule {}
