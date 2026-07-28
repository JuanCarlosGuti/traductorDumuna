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
  /** Siempre vacío al generar: es la columna que llena el hablante. */
  damana: string;
  motivo: MotivoNecesito;
  prioridad: 1 | 2;
  vecesVisto: number;
  fecha: string;
  /** Oración del corpus donde aparece la palabra, para dar contexto. */
  ejemploEspanol: string;
  ejemploDamana: string;
}

/** Palabra damana frecuente que el glosario todavía no traduce. */
export interface FilaNecesitoDamana {
  damana: string;
  /** Siempre vacío al generar: es la columna que llena el hablante. */
  espanol: string;
  vecesVisto: number;
  ejemploDamana: string;
  ejemploEspanol: string;
}

/**
 * Descarta ruido de teclado ("zzzz") sin ser restrictivo con el español:
 * toda palabra española tiene al menos una vocal.
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
   * Palabras españolas que le faltan al traductor, ordenadas por utilidad:
   * primero las que aparecieron en traducciones con poco apoyo (uso real),
   * después las que salen en el corpus pero no están en el glosario.
   *
   * Se descartan: stopwords, lo ya cubierto por el glosario, ruido de
   * teclado, los probables nombres propios (solo aparecen con mayúscula
   * inicial) y las palabras que se escriben igual en damana.
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
      // Ya estaba: gana la prioridad más alta y se acumula el uso.
      previa.vecesVisto += veces;
      if (prioridad < previa.prioridad) {
        previa.prioridad = prioridad;
        previa.motivo = motivo;
      }
      if (fecha > previa.fecha) previa.fecha = fecha;
    };

    // Prioridad 1 — lo que pediste traducir y el corpus no respaldó.
    for (const registro of this.traducciones.listar()) {
      const apoyo = evaluarApoyo({
        puntajeMedio: registro.puntajeMedio,
        fuenteTop: registro.fuenteTop,
        ejemplosRecuperados: registro.ejemplosRecuperados,
        ejemplosEnContexto: registro.ejemplosEnContexto,
      });
      if (apoyo.nivel !== 'revisar') continue;
      // El lado español: la entrada si tradujiste desde español, la salida si no.
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

    // Prioridad 2 — vocabulario del corpus que el glosario aún no cubre.
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
   * Palabras damana frecuentes que el glosario todavía no traduce, con una
   * oración real donde aparecen. Es el camino inverso al de `calcular()`:
   * aquí el hablante aporta el significado en español.
   */
  calcularDamana(limite = TOPE_FILAS): FilaNecesitoDamana[] {
    const enGlosario = new Set(
      this.repo.listarVocabulario().flatMap((e) =>
        tokenizarDamana(e.damana).map((t) => t.normalizada),
      ),
    );
    // Las formas conjugadas ya tienen glosa en la tabla de conjugaciones.
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
          // Probables nombres propios: nunca aparecen en minúscula.
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

  /** Primera oración fiable donde aparece cada palabra española. */
  private ejemplosPorPalabraEspanola(): Map<string, { espanol: string; damana: string }> {
    return this.primerEjemplo((fila) => fila.textoEspanol);
  }

  /** Primera oración fiable donde aparece cada palabra damana. */
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

  /** Palabras que aparecen en el lado damana: se escriben igual, no hay nada que traducir. */
  private palabrasEnDamana(): Set<string> {
    return new Set(this.repo.frecuenciasConOriginales().map((f) => f.palabra));
  }

  /**
   * Frecuencia de cada palabra española del corpus, excluyendo las que solo
   * aparecen con mayúscula inicial (probables nombres propios: Jesús, David…).
   */
  private frecuenciasEspanol(): [string, number][] {
    const info = new Map<
      string,
      { palabra: string; veces: number; algunaEnMinuscula: boolean }
    >();
    const fuentes = [FuenteCorpus.oraciones, FuenteCorpus.frases];
    for (const fuente of fuentes) {
      for (const fila of this.repo.textosDe(fuente)) {
        if (fila.estado === 'revisar') continue; // solo alineaciones fiables
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
