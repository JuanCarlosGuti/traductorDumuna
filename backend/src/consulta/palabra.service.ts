import { Injectable, NotFoundException } from '@nestjs/common';
import { normalizar } from '../comun/texto/normalizador';
import { esStopwordEspanol } from '../comun/texto/stopwords-es';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { BusquedaService } from './busqueda.service';
import { Idioma } from './consulta.enums';
import { CorpusRepository } from './corpus.repository';
import {
  EntradaVocabularioFichaDto,
  FichaPalabraDto,
  FormaVerbalDto,
  TraduccionCandidataDto,
} from './dto/consulta.dto';

const MAX_CONCORDANCIAS = 10;
const MAX_CANDIDATAS = 10;

@Injectable()
export class PalabraService {
  constructor(
    private readonly repo: CorpusRepository,
    private readonly busqueda: BusquedaService,
  ) {}

  ficha(token: string): FichaPalabraDto {
    const palabra = normalizar(token.trim());
    const frecuenciaPorFuente = this.repo.frecuenciaPorFuente(palabra);
    const frecuenciaTotal = frecuenciaPorFuente.reduce(
      (suma, f) => suma + f.frecuencia,
      0,
    );
    if (frecuenciaTotal === 0) {
      throw new NotFoundException(
        `La palabra "${token}" no aparece en el corpus damana`,
      );
    }

    const concordancias = this.busqueda.buscar({
      q: palabra,
      idioma: Idioma.damana,
      limite: MAX_CONCORDANCIAS,
    }).resultados;

    return {
      palabra,
      entradasVocabulario: this.entradasVocabulario(palabra),
      formasVerbales: this.formasVerbales(palabra),
      frecuenciaTotal,
      frecuenciaPorFuente,
      concordancias,
      traduccionesCandidatas: this.traduccionesCandidatas(palabra),
    };
  }

  /** Traducciones directas: entradas de vocabulario cuyo damana ES la palabra. */
  private entradasVocabulario(palabraNormalizada: string): EntradaVocabularioFichaDto[] {
    return this.repo
      .listarVocabulario()
      .filter((e) => normalizar(e.damana) === palabraNormalizada)
      .map((e) => ({
        espanol: e.espanol,
        categoria: e.categoria,
        notas: e.notas,
        fuente: e.fuente,
      }));
  }

  /** Si la palabra es una forma conjugada, su glosa y lema. */
  private formasVerbales(palabraNormalizada: string): FormaVerbalDto[] {
    return this.repo
      .listarConjugaciones()
      .filter((c) => normalizar(c.damana) === palabraNormalizada)
      .map((c) => ({ espanol: c.espanol, lema: c.lema }));
  }

  /**
   * Co-ocurrencia simple: cuenta las palabras españolas de todos los
   * textos paralelos donde aparece el token, excluyendo stopwords y
   * palabras de una sola letra.
   */
  private traduccionesCandidatas(
    palabraNormalizada: string,
  ): TraduccionCandidataDto[] {
    const conteo = new Map<string, number>();
    for (const origen of this.repo.origenesDe(palabraNormalizada)) {
      const espanol = this.repo.textoEspanolDe(origen.fuente, origen.id);
      for (const token of tokenizarDamana(espanol)) {
        if (token.normalizada.length < 2) continue;
        if (esStopwordEspanol(token.normalizada)) continue;
        conteo.set(token.normalizada, (conteo.get(token.normalizada) ?? 0) + 1);
      }
    }
    return [...conteo.entries()]
      .map(([palabra, coocurrencias]) => ({ palabra, coocurrencias }))
      .sort(
        (a, b) =>
          b.coocurrencias - a.coocurrencias || a.palabra.localeCompare(b.palabra),
      )
      .slice(0, MAX_CANDIDATAS);
  }
}
