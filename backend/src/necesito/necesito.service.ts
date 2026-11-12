import { Injectable } from '@nestjs/common';
import { normalizar } from '../comun/texto/normalizador';
import { esStopwordEspanol } from '../comun/texto/stopwords-es';
import { tokenizarDamana } from '../comun/texto/tokenizador';
import { FuenteCorpus } from '../consulta/consulta.enums';
import { CorpusRepository } from '../consulta/corpus.repository';
import { evaluarApoyo } from '../traduccion/apoyo';
import { TraduccionesRepository } from '../traduccion/traducciones.repository';

export const TOPE_FILAS = 300;

export type MotivoNecesito =
  | 'traduccion_con_poco_apoyo'
  | 'en_corpus_sin_glosario';

export interface FilaNecesito {
  espanol: string;
  /** Always empty when generated: it is the column the speaker fills in. */
  damana: string;
  motivo: MotivoNecesito;
  prioridad: 1 | 2;
  vecesVisto: number;
  fecha: string;
  /** Corpus sentence where the word appears, to give context. */
  ejemploEspanol: string;
  ejemploDamana: string;
}

/** Frequent Damana word the glossary does not translate yet. */
export interface FilaNecesitoDamana {
  damana: string;
  /** Always empty when generated: it is the column the speaker fills in. */
  espanol: string;
  vecesVisto: number;
  ejemploDamana: string;
  ejemploEspanol: string;
}

/**
 * Discards keyboard noise ("zzzz") without being restrictive with Spanish:
 * every Spanish word has at least one vowel.
 */
function pareceEspanol(palabra: string): boolean {
  return palabra.length >= 3 && /[aeiouáéíóúü]/i.test(palabra);
}

function empiezaEnMayuscula(palabra: string): boolean {
  const c = palabra[0] ?? '';
  return c !== c.toLowerCase() && c === c.toUpperCase();
}

@Injectable()
export class NecesitoService {
  constructor(
    private readonly repo: CorpusRepository,
    private readonly traducciones: TraduccionesRepository,
  ) {}

  /**
   * Spanish words the translator is missing, ordered by usefulness:
   * first those that appeared in translations with little support (real use),
   * then those that show up in the corpus but are not in the glossary.
   *
   * Discarded: stopwords, what the glossary already covers, keyboard
   * noise, probable proper names (they only appear with an initial
   * capital) and words that are written the same in Damana.
   */
  calcular(hoy: string, limite = TOPE_FILAS): FilaNecesito[] {
    const cubiertas = this.palabrasDelGlosario();
    const enDamana = this.palabrasEnDamana();
    const ejemplos = this.ejemplosPorPalabraEspanola();
    const candidatas = new Map<string, FilaNecesito>();

    const agregar = (
      palabra: string,
      motivo: MotivoNecesito,
      prioridad: 1 | 2,
      fecha: string,
      veces: number,
    ): void => {
      const clave = normalizar(palabra);
      if (
        esStopwordEspanol(clave) ||
        cubiertas.has(clave) ||
        enDamana.has(clave) ||
        !pareceEspanol(palabra)
      ) {
        return;
      }
      const previa = candidatas.get(clave);
      if (!previa) {
        const ejemplo = ejemplos.get(clave);
        candidatas.set(clave, {
          espanol: palabra.toLowerCase(),
          damana: '',
          motivo,
          prioridad,
          vecesVisto: veces,
          fecha,
          ejemploEspanol: ejemplo?.espanol ?? '',
          ejemploDamana: ejemplo?.damana ?? '',
        });
        return;
      }
      // Already there: the highest priority wins and usage accumulates.
      previa.vecesVisto += veces;
      if (prioridad < previa.prioridad) {
        previa.prioridad = prioridad;
        previa.motivo = motivo;
      }
      if (fecha > previa.fecha) previa.fecha = fecha;
    };

    // Priority 1 — what you asked to translate and the corpus did not back up.
    for (const registro of this.traducciones.listar()) {
      const apoyo = evaluarApoyo({
        puntajeMedio: registro.puntajeMedio,
        fuenteTop: registro.fuenteTop,
        ejemplosRecuperados: registro.ejemplosRecuperados,
        ejemplosEnContexto: registro.ejemplosEnContexto,
      });
      if (apoyo.nivel !== 'revisar') continue;
      // The Spanish side: the input if you translated from Spanish, the output otherwise.
      const ladoEspanol =
        registro.direccion === 'espanol_a_damana'
          ? registro.texto
          : registro.traduccion;
      for (const token of tokenizarDamana(ladoEspanol)) {
        agregar(
          token.original,
          'traduccion_con_poco_apoyo',
          1,
          registro.creadoEn.slice(0, 10),
          1,
        );
      }
    }

    // Priority 2 — corpus vocabulary the glossary does not cover yet.
    for (const [palabra, veces] of this.frecuenciasEspanol()) {
      agregar(palabra, 'en_corpus_sin_glosario', 2, hoy, veces);
    }

    return [...candidatas.values()]
      .sort(
        (a, b) =>
          a.prioridad - b.prioridad ||
          b.vecesVisto - a.vecesVisto ||
          a.espanol.localeCompare(b.espanol, 'es'),
      )
      .slice(0, limite);
  }

  /**
   * Frequent Damana words the glossary does not translate yet, with a
   * real sentence where they appear. It is the reverse path of `calcular()`:
   * here the speaker provides the meaning in Spanish.
   */
  calcularDamana(limite = TOPE_FILAS): FilaNecesitoDamana[] {
    const enGlosario = new Set(
      this.repo.listarVocabulario().flatMap((e) =>
        tokenizarDamana(e.damana).map((t) => t.normalizada),
      ),
    );
    // Conjugated forms already have a gloss in the conjugations table.
    const enConjugaciones = new Set(
      this.repo.listarConjugaciones().flatMap((c) =>
        tokenizarDamana(c.damana).map((t) => t.normalizada),
      ),
    );
    const ejemplos = this.ejemplosPorPalabraDamana();

    return this.repo
      .frecuenciasConOriginales()
      .filter(
        (f) =>
          !enGlosario.has(f.palabra) &&
          !enConjugaciones.has(f.palabra) &&
          // Probable proper names: they never appear in lowercase.
          f.originales.some((o) => !empiezaEnMayuscula(o)),
      )
      .slice(0, limite)
      .map((f) => {
        const ejemplo = ejemplos.get(f.palabra);
        return {
          damana: f.palabra,
          espanol: '',
          vecesVisto: f.frecuencia,
          ejemploDamana: ejemplo?.damana ?? '',
          ejemploEspanol: ejemplo?.espanol ?? '',
        };
      });
  }

  /** First reliable sentence where each Spanish word appears. */
  private ejemplosPorPalabraEspanola(): Map<string, { espanol: string; damana: string }> {
    return this.primerEjemplo((fila) => fila.textoEspanol);
  }

  /** First reliable sentence where each Damana word appears. */
  private ejemplosPorPalabraDamana(): Map<string, { espanol: string; damana: string }> {
    return this.primerEjemplo((fila) => fila.textoDamana);
  }

  private primerEjemplo(
    lado: (fila: { textoDamana: string; textoEspanol: string }) => string,
  ): Map<string, { espanol: string; damana: string }> {
    const ejemplos = new Map<string, { espanol: string; damana: string }>();
    for (const fuente of [FuenteCorpus.oraciones, FuenteCorpus.frases]) {
      for (const fila of this.repo.textosDe(fuente)) {
        if (fila.estado === 'revisar') continue;
        for (const token of tokenizarDamana(lado(fila))) {
          if (ejemplos.has(token.normalizada)) continue;
          ejemplos.set(token.normalizada, {
            espanol: fila.textoEspanol,
            damana: fila.textoDamana,
          });
        }
      }
    }
    return ejemplos;
  }

  private palabrasDelGlosario(): Set<string> {
    const cubiertas = new Set<string>();
    for (const entrada of this.repo.listarVocabulario()) {
      for (const token of tokenizarDamana(entrada.espanol)) {
        cubiertas.add(token.normalizada);
      }
    }
    return cubiertas;
  }

  /** Words that appear on the Damana side: written the same, nothing to translate. */
  private palabrasEnDamana(): Set<string> {
    return new Set(this.repo.frecuenciasConOriginales().map((f) => f.palabra));
  }

  /**
   * Frequency of each Spanish word in the corpus, excluding those that only
   * appear with an initial capital (probable proper names: Jesús, David…).
   */
  private frecuenciasEspanol(): [string, number][] {
    const info = new Map<
      string,
      { palabra: string; veces: number; algunaEnMinuscula: boolean }
    >();
    const fuentes = [FuenteCorpus.oraciones, FuenteCorpus.frases];
    for (const fuente of fuentes) {
      for (const fila of this.repo.textosDe(fuente)) {
        if (fila.estado === 'revisar') continue; // reliable alignments only
        for (const token of tokenizarDamana(fila.textoEspanol)) {
          const entrada = info.get(token.normalizada) ?? {
            palabra: token.original.toLowerCase(),
            veces: 0,
            algunaEnMinuscula: false,
          };
          entrada.veces++;
          if (!empiezaEnMayuscula(token.original)) entrada.algunaEnMinuscula = true;
          info.set(token.normalizada, entrada);
        }
      }
    }
    return [...info.values()]
      .filter((e) => e.algunaEnMinuscula)
      .sort((a, b) => b.veces - a.veces)
      .map((e) => [e.palabra, e.veces]);
  }
}
