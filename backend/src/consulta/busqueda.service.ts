import { Injectable } from '@nestjs/common';
import {
  buscarOcurrencias,
  extraerFragmento,
} from '../comun/texto/concordancia';
import { FuenteCorpus, Idioma } from './consulta.enums';
import { CorpusRepository } from './corpus.repository';
import { ConcordanciaDto, RespuestaBusquedaDto } from './dto/consulta.dto';

export interface ParametrosBusqueda {
  q: string;
  idioma: Idioma;
  fuente?: FuenteCorpus;
  limite: number;
}

@Injectable()
export class BusquedaService {
  constructor(private readonly repo: CorpusRepository) {}

  buscar(params: ParametrosBusqueda): RespuestaBusquedaDto {
    const fuentes = params.fuente
      ? [params.fuente]
      : [
          FuenteCorpus.oraciones,
          FuenteCorpus.frases,
          FuenteCorpus.vocabulario,
          FuenteCorpus.conjugaciones,
        ];

    let total = 0;
    const resultados: ConcordanciaDto[] = [];

    for (const fuente of fuentes) {
      for (const fila of this.repo.textosDe(fuente)) {
        const texto =
          params.idioma === Idioma.damana ? fila.textoDamana : fila.textoEspanol;
        const paralelo =
          params.idioma === Idioma.damana ? fila.textoEspanol : fila.textoDamana;
        for (const ocurrencia of buscarOcurrencias(texto, params.q)) {
          total++;
          if (resultados.length < params.limite) {
            resultados.push({
              fuente,
              id: fila.id,
              referencia: fila.referencia,
              fragmento: extraerFragmento(texto, ocurrencia),
              textoParalelo: paralelo,
            });
          }
        }
      }
    }

    return { consulta: params.q, idioma: params.idioma, total, resultados };
  }
}
