import Anthropic from '@anthropic-ai/sdk';
import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { normalizar } from '../comun/texto/normalizador';
import { esStopwordEspanol } from '../comun/texto/stopwords-es';
import { FuenteCorpus, Idioma } from '../consulta/consulta.enums';
import {
  ContextoRecuperado,
  FragmentoRecuperado,
  RetrievalService,
} from '../consulta/retrieval.service';
import { PendientesRepository } from '../pendientes/pendientes.repository';
import { CLIENTE_ANTHROPIC } from './anthropic.provider';
import { evaluarApoyo, SenalesApoyo } from './apoyo';
import {
  CONFIG_TRADUCTOR,
  ConfigTraductor,
  TEMPERATURA_POR_DEFECTO,
  timeoutModeloMs,
} from './config-traductor.provider';
import {
  DireccionTraduccion,
  RespuestaTraduccionDto,
  TraducirDto,
  ValidacionGuardadaDto,
  ValidarTraduccionDto,
} from './dto/traduccion.dto';
import {
  armarPromptSistema,
  armarPromptUsuario,
  esquemaRespuesta,
  normalizarRespuestaModelo,
  RespuestaModelo,
} from './prompt';
import { TraduccionesRepository } from './traducciones.repository';
import { ValidadasRepository } from './validadas.repository';

/**
 * Con pensamiento adaptativo activo, los tokens de razonamiento cuentan
 * dentro de max_tokens: se deja margen de sobra para que el JSON no se
 * corte. En los proveedores compatibles no hay razonamiento oculto.
 */
const MAX_TOKENS_ANTHROPIC = 16_000;
const MAX_TOKENS_COMPATIBLE = 4096;
/** La frase original se guarda acortada como contexto de la pendiente. */
const MAX_CONTEXTO_PENDIENTE = 200;

/**
 * Límite de uso del proveedor compatible (429). El plan gratuito de Groq
 * admite unas cuatro traducciones por minuto con prompts de este tamaño:
 * se espera lo que pida Retry-After (acotado) y se reintenta, en vez de
 * fallar a la primera.
 */
export const REINTENTOS_429 = 2;
export const ESPERA_429_POR_DEFECTO_MS = 15_000;
export const ESPERA_429_MAXIMA_MS = 30_000;

export function esperaTrasLimite(retryAfter: string | null | undefined): number {
  const segundos = Number(retryAfter);
  if (Number.isFinite(segundos) && segundos > 0) {
    return Math.min(Math.ceil(segundos * 1000), ESPERA_429_MAXIMA_MS);
  }
  return ESPERA_429_POR_DEFECTO_MS;
}

/** Separado para que los tests no esperen de verdad. */
export const reloj = {
  dormir: (ms: number): Promise<void> => new Promise((resolver) => setTimeout(resolver, ms)),
};

export const MENSAJE_SIN_PROVEEDOR =
  'El traductor no tiene ningún motor configurado. Opciones: ' +
  '(A) gratis: define TRADUCTOR_BASE_URL, TRADUCTOR_MODELO y opcionalmente ' +
  'TRADUCTOR_API_KEY para un proveedor compatible con OpenAI (Ollama local, ' +
  'Google Gemini, Groq, Hugging Face); ' +
  '(B) Claude: define ANTHROPIC_API_KEY (console.anthropic.com). ' +
  'Después reinicia el backend. Detalles en el README.';

export interface OpcionesTraduccion {
  /**
   * false para evaluar sin dejar huella: ni fila en traducciones ni
   * pendientes nuevas. Por defecto se registra todo.
   */
  registrar?: boolean;
}

/**
 * Extrae un objeto JSON de la respuesta del modelo con tolerancia a
 * bloques ```json ... ``` y a texto alrededor: si hay un bloque cercado se
 * usa su contenido; después se recorta del primer '{' al último '}'.
 */
export function extraerJson(texto: string): Record<string, unknown> {
  const cercado = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidato = cercado ? cercado[1] : texto;
  const inicio = candidato.indexOf('{');
  const fin = candidato.lastIndexOf('}');
  if (inicio === -1 || fin <= inicio) {
    throw new Error('La respuesta del modelo no contiene un objeto JSON');
  }
  return JSON.parse(candidato.slice(inicio, fin + 1)) as Record<string, unknown>;
}

@Injectable()
export class TraduccionService {
  private readonly logger = new Logger(TraduccionService.name);

  constructor(
    @Inject(CLIENTE_ANTHROPIC) private readonly cliente: Anthropic | null,
    @Inject(CONFIG_TRADUCTOR) private readonly config: ConfigTraductor,
    private readonly retrieval: RetrievalService,
    private readonly registro: TraduccionesRepository,
    private readonly pendientes: PendientesRepository,
    private readonly validadas: ValidadasRepository,
  ) {}

  disponible(): boolean {
    return this.config.proveedor !== null;
  }

  configuracion(): ConfigTraductor {
    return this.config;
  }

  async traducir(
    dto: TraducirDto,
    opciones: OpcionesTraduccion = {},
  ): Promise<RespuestaTraduccionDto> {
    if (!this.config.proveedor) {
      throw new ServiceUnavailableException({
        codigo: 'SIN_PROVEEDOR',
        message: MENSAJE_SIN_PROVEEDOR,
      });
    }

    const idiomaOrigen =
      dto.direccion === DireccionTraduccion.damana_a_espanol ? Idioma.damana : Idioma.espanol;
    const contexto = this.retrieval.recuperarContexto(dto.texto, idiomaOrigen);

    const sistema = armarPromptSistema(dto.direccion);
    const usuario = armarPromptUsuario(dto.texto, dto.direccion, contexto);
    const texto =
      this.config.proveedor === 'anthropic'
        ? await this.llamarAnthropic(sistema, usuario, esquemaRespuesta(dto.direccion))
        : await this.llamarCompatible(sistema, usuario);
    const modelo = normalizarRespuestaModelo(this.parsearRespuesta(texto));

    const senales = this.senalesDeApoyo(contexto.ejemplos);
    const respuesta = this.armarRespuesta(modelo, contexto, senales);

    if (opciones.registrar !== false) {
      this.registrarTraduccion(dto, respuesta, senales);
      this.registrarPendientes(dto, respuesta.palabrasSinEquivalente);
    }
    return respuesta;
  }

  /** «Esta traducción es correcta» / «corregir»: guarda el par validado. */
  validar(dto: ValidarTraduccionDto): ValidacionGuardadaDto {
    const haciaDamana = dto.direccion === DireccionTraduccion.espanol_a_damana;
    this.validadas.guardar({
      espanol: (haciaDamana ? dto.texto : dto.traduccion).trim(),
      damana: (haciaDamana ? dto.traduccion : dto.texto).trim(),
      direccion: dto.direccion,
      origen: dto.origen,
      traduccionModelo: dto.traduccionModelo?.trim() || null,
    });
    return { guardada: true, total: this.validadas.contar() };
  }

  private armarRespuesta(
    modelo: RespuestaModelo,
    contexto: ContextoRecuperado,
    senales: SenalesApoyo,
  ): RespuestaTraduccionDto {
    return {
      traduccion: modelo.traduccion,
      glosa: modelo.glosa,
      palabrasSinEquivalente: modelo.palabrasSinEquivalente,
      reglasAplicadas: modelo.reglasAplicadas,
      confianza: modelo.confianza,
      explicacionBreve: modelo.explicacionBreve,
      apoyo: evaluarApoyo(senales),
      ejemplos: contexto.ejemplos.map((e) => ({
        fuente: e.fuente,
        dominio: e.dominio,
        referencia: e.referencia,
        damana: e.damana,
        espanol: e.espanol,
        puntaje: e.puntaje,
      })),
      diccionario: contexto.diccionario.map((a) => ({
        palabra: a.palabra,
        espanol: a.espanol,
        damana: a.damana,
        categoria: a.categoria,
        coincidencia: a.coincidencia,
      })),
      nombresPropios: contexto.nombresPropios,
      reglas: contexto.reglas.map((r) => ({
        forma: r.forma,
        significado: r.significado,
        ejemplo:
          r.ejemploBase && r.ejemploRegla
            ? `${r.ejemploBase} → ${r.ejemploRegla}${r.traduccionEjemplo ? ` = ${r.traduccionEjemplo}` : ''}`
            : null,
        disparador: r.disparador,
      })),
      disparadores: contexto.disparadores,
    };
  }

  /**
   * Cuánto respalda el corpus a esta traducción. Los ejemplos vienen
   * agrupados por dominio, así que el «top» es el máximo, no el primero.
   */
  private senalesDeApoyo(ejemplos: FragmentoRecuperado[]): SenalesApoyo {
    const top = ejemplos.reduce<FragmentoRecuperado | null>(
      (mejor, e) => (mejor === null || e.puntaje > mejor.puntaje ? e : mejor),
      null,
    );
    return {
      puntajeMedio: ejemplos.length
        ? ejemplos.reduce((suma, e) => suma + e.puntaje, 0) / ejemplos.length
        : 0,
      fuenteTop: top?.fuente ?? null,
      ejemplosRecuperados: ejemplos.length,
      ejemplosEnContexto: ejemplos.filter(
        (e) => e.fuente === FuenteCorpus.oraciones || e.fuente === FuenteCorpus.frases,
      ).length,
    };
  }

  /**
   * Guarda la traducción y sus señales de apoyo. Es best-effort a propósito:
   * un fallo del registro NUNCA debe impedir que el usuario reciba su
   * traducción, que es lo que vino a buscar.
   */
  private registrarTraduccion(
    dto: TraducirDto,
    respuesta: RespuestaTraduccionDto,
    senales: SenalesApoyo,
  ): void {
    try {
      this.registro.registrar({
        texto: dto.texto,
        traduccion: respuesta.traduccion,
        direccion: dto.direccion,
        puntajeTop: respuesta.ejemplos.reduce((max, e) => Math.max(max, e.puntaje), 0),
        puntajeMedio: senales.puntajeMedio,
        fuenteTop: senales.fuenteTop,
        ejemplosRecuperados: senales.ejemplosRecuperados,
        ejemplosEnContexto: senales.ejemplosEnContexto ?? 0,
        palabrasDudosas: respuesta.palabrasSinEquivalente,
        vocabularioUsado: respuesta.diccionario.map((a) => ({ espanol: a.espanol, damana: a.damana })),
        modelo: this.config.modelo,
        confianza: respuesta.confianza,
        reglasAplicadas: respuesta.reglasAplicadas,
        glosa: respuesta.glosa,
      });
    } catch (error) {
      this.logger.warn(`No se pudo registrar la traducción: ${mensajeDe(error)}`);
    }
  }

  /** Cierra el bucle con las hablantes: lo que faltó queda apuntado. */
  private registrarPendientes(dto: TraducirDto, palabras: string[]): void {
    const idioma = dto.direccion === DireccionTraduccion.espanol_a_damana ? 'espanol' : 'damana';
    // Los artículos y demás palabras gramaticales del español no son
    // vocabulario que falte: el damana no los tiene. Si el modelo los deja
    // entre corchetes se muestran, pero no se les preguntan a las hablantes.
    const porRegistrar =
      idioma === 'espanol' ? palabras.filter((p) => !esStopwordEspanol(normalizar(p))) : palabras;
    if (porRegistrar.length === 0) return;
    const contexto = dto.texto.replace(/\s+/g, ' ').trim().slice(0, MAX_CONTEXTO_PENDIENTE);
    for (const palabra of porRegistrar) {
      try {
        this.pendientes.registrarPedida(palabra, idioma, contexto);
      } catch (error) {
        this.logger.warn(`No se pudo registrar la pendiente «${palabra}»: ${mensajeDe(error)}`);
      }
    }
  }

  /**
   * Claude vía el SDK oficial, con salida estructurada (output_config.format
   * con el JSON Schema de la respuesta) para que el JSON llegue bien formado.
   */
  private async llamarAnthropic(
    sistema: string,
    usuario: string,
    esquema: Record<string, unknown>,
  ): Promise<string> {
    try {
      const respuesta = await this.cliente!.messages.create({
        model: this.config.modelo,
        max_tokens: MAX_TOKENS_ANTHROPIC,
        // El prompt de sistema es idéntico en todas las traducciones de una
        // misma dirección: se marca para la caché de prompts de Anthropic
        // (prefijo mínimo de 512 tokens en claude-opus-5-5; este prompt
        // ronda los 750). La caché dura 5 min entre llamadas: entra en
        // rachas (evaluaciones, sesiones de trabajo), no en traducciones
        // sueltas. El mensaje de usuario cambia con cada frase (diccionario,
        // reglas y ejemplos dependen de ella), así que no tiene prefijo
        // estable que marcar.
        system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: usuario }],
        // Sin temperature: claude-opus-5-5 la rechaza con 400 (ver
        // config-traductor.provider.ts). El esfuerzo solo se manda si se
        // configuró; si no, vale el valor por defecto de la API.
        output_config: {
          format: { type: 'json_schema', schema: esquema },
          ...(this.config.esfuerzo ? { effort: this.config.esfuerzo } : {}),
        },
      });
      if (respuesta.stop_reason === 'refusal') {
        throw new BadGatewayException(
          'El modelo rechazó la petición por sus filtros de seguridad. Reformula el texto e intenta de nuevo.',
        );
      }
      const bloqueTexto = respuesta.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      );
      if (!bloqueTexto) {
        throw new BadGatewayException(
          'El modelo no devolvió texto (¿respuesta cortada?). Intenta de nuevo.',
        );
      }
      return bloqueTexto.text;
    } catch (error) {
      throw this.traducirErrorAnthropic(error);
    }
  }

  /**
   * Llama a cualquier API compatible con OpenAI (Ollama, Gemini, Groq,
   * Hugging Face router...) usando fetch nativo: POST {base}/chat/completions.
   * Se pide response_format json_object; si el proveedor no lo soporta
   * (400) se reintenta sin él y se confía en extraerJson. Un 429 se espera
   * y se reintenta hasta REINTENTOS_429 veces antes de rendirse.
   */
  private async llamarCompatible(
    sistema: string,
    usuario: string,
    conFormatoJson = true,
    intento = 0,
  ): Promise<string> {
    const url = `${this.config.baseUrl!.replace(/\/+$/, '')}/chat/completions`;
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), timeoutModeloMs());

    let respuesta: Response;
    try {
      respuesta = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.config.modelo,
          max_tokens: MAX_TOKENS_COMPATIBLE,
          temperature: this.config.temperatura ?? TEMPERATURA_POR_DEFECTO,
          ...(conFormatoJson ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: sistema },
            { role: 'user', content: usuario },
          ],
        }),
        signal: control.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GatewayTimeoutException(
          `La traducción superó el tiempo de espera (${Math.round(timeoutModeloMs() / 1000)} s). ` +
            'Con modelos locales puedes ampliarlo con TRADUCTOR_TIMEOUT_MS.',
        );
      }
      throw new GatewayTimeoutException(
        `No se pudo conectar con ${this.config.baseUrl}. ` +
          '¿Está corriendo el proveedor (p. ej. Ollama) y la URL es correcta?',
      );
    } finally {
      clearTimeout(temporizador);
    }

    if (respuesta.status === 400 && conFormatoJson) {
      return this.llamarCompatible(sistema, usuario, false, intento);
    }
    if (respuesta.status === 429 && intento < REINTENTOS_429) {
      const espera = esperaTrasLimite(respuesta.headers?.get?.('retry-after'));
      this.logger.warn(
        `El proveedor devolvió 429; se reintenta en ${Math.round(espera / 1000)} s ` +
          `(intento ${intento + 1} de ${REINTENTOS_429}).`,
      );
      await reloj.dormir(espera);
      return this.llamarCompatible(sistema, usuario, conFormatoJson, intento + 1);
    }
    if (respuesta.status === 401 || respuesta.status === 403) {
      throw new BadGatewayException(
        'El proveedor rechazó la clave TRADUCTOR_API_KEY. Revísala y reinicia el backend.',
      );
    }
    if (respuesta.status === 429) {
      throw new HttpException(
        'El proveedor devolvió un límite de uso (429). Espera un momento y reintenta.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (respuesta.status === 404) {
      throw new BadGatewayException(
        `El proveedor no encontró el modelo "${this.config.modelo}" (404). ` +
          'Revisa TRADUCTOR_MODELO (con Ollama: ¿hiciste "ollama pull <modelo>"?).',
      );
    }
    if (!respuesta.ok) {
      throw new BadGatewayException(`El proveedor devolvió un error (${respuesta.status}).`);
    }

    const json = (await respuesta.json().catch(() => null)) as {
      choices?: { message?: { content?: unknown } }[];
    } | null;
    const texto = json?.choices?.[0]?.message?.content;
    if (typeof texto !== 'string' || texto.length === 0) {
      throw new BadGatewayException(
        'El proveedor no devolvió texto en el formato esperado (choices[0].message.content).',
      );
    }
    return texto;
  }

  /** Mapea los errores tipados del SDK de Anthropic a errores HTTP claros. */
  private traducirErrorAnthropic(error: unknown): Error {
    if (error instanceof HttpException) return error;
    if (error instanceof Anthropic.AuthenticationError) {
      return new BadGatewayException(
        'La clave ANTHROPIC_API_KEY no es válida o fue revocada. Revísala y reinicia el backend.',
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return new HttpException(
        'La API de Anthropic devolvió un límite de uso (429). Espera un momento y reintenta.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      return new GatewayTimeoutException(
        'La traducción tardó demasiado y se agotó el tiempo de espera. Reintenta con un texto más corto.',
      );
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return new GatewayTimeoutException(
        'No se pudo conectar con la API de Anthropic. Revisa tu conexión a internet.',
      );
    }
    if (error instanceof Anthropic.APIError) {
      return new BadGatewayException(
        `La API de Anthropic devolvió un error (${String(error.status)}): ${error.message}`,
      );
    }
    return new BadGatewayException(`Error inesperado al traducir: ${mensajeDe(error)}`);
  }

  private parsearRespuesta(texto: string): Record<string, unknown> {
    try {
      return extraerJson(texto);
    } catch {
      throw new BadGatewayException(
        'El modelo no devolvió el JSON esperado. Reintenta la traducción.',
      );
    }
  }
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
