import { Module } from '@nestjs/common';
import { BusquedaService } from './busqueda.service';
import { ConsultaController } from './consulta.controller';
import { CorpusRepository } from './corpus.repository';
import { FrecuenciasService } from './frecuencias.service';
import { GramaticaController } from './gramatica.controller';
import { GramaticaService } from './gramatica.service';
import { PalabraService } from './palabra.service';

@Module({
  controllers: [ConsultaController, GramaticaController],
  providers: [
    CorpusRepository,
    BusquedaService,
    PalabraService,
    FrecuenciasService,
    GramaticaService,
  ],
  exports: [CorpusRepository, PalabraService, FrecuenciasService],
})
export class ConsultaModule {}
