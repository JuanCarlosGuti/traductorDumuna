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
import { normalize } from '../common/text/normalizer';
import { isSpanishStopword } from '../common/text/stopwords-es';
import { CorpusSource, Language } from '../query/query.enums';
import {
  RetrievedContext,
  RetrievedFragment,
  RetrievalService,
} from '../query/retrieval.service';
import { PendingRepository } from '../pending/pending.repository';
import { ANTHROPIC_CLIENT } from './anthropic.provider';
import { evaluateSupport, SupportSignals } from './support';
import {
  TRANSLATOR_CONFIG,
  TranslatorConfig,
  DEFAULT_TEMPERATURE,
  modelTimeoutMs,
} from './translator-config.provider';
import {
  TranslationDirection,
  TranslationResponseDto,
  TranslateDto,
  SavedValidationDto,
  ValidateTranslationDto,
} from './dto/translation.dto';
import {
  buildSystemPrompt,
  buildUserPrompt,
  responseSchema,
  normalizeModelResponse,
  ModelResponse,
} from './prompt';
import { TranslationsRepository, ModelUsage } from './translations.repository';
import { ValidatedRepository } from './validated.repository';

/**
 * With adaptive thinking active, reasoning tokens count
 * within max_tokens: plenty of headroom is left so that the JSON is not
 * cut off. Compatible providers have no hidden reasoning.
 */
const MAX_TOKENS_ANTHROPIC = 16_000;
const MAX_TOKENS_COMPATIBLE = 4096;
/** The original sentence is stored shortened as context for the pending item. */
const MAX_PENDING_CONTEXT = 200;

/**
 * Usage limit of the compatible provider (429). Groq's free plan
 * allows about four translations per minute with prompts of this size:
 * it waits for what Retry-After asks (bounded) and retries, instead of
 * failing at the first attempt.
 */
export const RETRIES_429 = 2;
export const DEFAULT_429_WAIT_MS = 15_000;
export const MAX_429_WAIT_MS = 30_000;

export function waitAfterLimit(retryAfter: string | null | undefined): number {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(Math.ceil(seconds * 1000), MAX_429_WAIT_MS);
  }
  return DEFAULT_429_WAIT_MS;
}

/** Separate so that tests do not really wait. */
export const clock = {
  dormir: (ms: number): Promise<void> => new Promise((resolver) => setTimeout(resolver, ms)),
};

export const NO_PROVIDER_MESSAGE =
  'El traductor no tiene ningún motor configurado. Opciones: ' +
  '(A) gratis: define TRADUCTOR_BASE_URL, TRADUCTOR_MODELO y opcionalmente ' +
  'TRADUCTOR_API_KEY para un proveedor compatible con OpenAI (Ollama local, ' +
  'Google Gemini, Groq, Hugging Face); ' +
  '(B) Claude: define ANTHROPIC_API_KEY (console.anthropic.com). ' +
  'Después reinicia el backend. Detalles en el README.';

/** What each provider returns: the model's text and, if reported, the usage. */
interface ModelOutput {
  texto: string;
  uso: ModelUsage | null;
}

/** Anthropic API usage → ModelUsage. */
export function usageFromAnthropic(usage: Anthropic.Usage | null | undefined): ModelUsage | null {
  if (!usage) return null;
  return {
    tokensEntrada: usage.input_tokens ?? null,
    tokensSalida: usage.output_tokens ?? null,
    tokensCacheLeidos: usage.cache_read_input_tokens ?? null,
    tokensCacheCreados: usage.cache_creation_input_tokens ?? null,
  };
}

interface UsageCompatible {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

/** OpenAI-style usage (Groq, Ollama, Gemini…) → ModelUsage. */
export function usageFromCompatible(usage: UsageCompatible | null | undefined): ModelUsage | null {
  if (!usage) return null;
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  return {
    tokensEntrada: num(usage.prompt_tokens),
    tokensSalida: num(usage.completion_tokens),
    tokensCacheLeidos: num(usage.prompt_tokens_details?.cached_tokens),
    tokensCacheCreados: null,
  };
}

export interface TranslationOptions {
  /**
   * false to evaluate without leaving a trace: no row in traducciones and no
   * new pending items. By default everything is logged.
   */
  registrar?: boolean;
}

/**
 * Extracts a JSON object from the model's response, tolerating
 * ```json ... ``` blocks and surrounding text: if there is a fenced block its
 * content is used; then it is trimmed from the first '{' to the last '}'.
 */
export function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('La respuesta del modelo no contiene un objeto JSON');
  }
  return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
}

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic | null,
    @Inject(TRANSLATOR_CONFIG) private readonly config: TranslatorConfig,
    private readonly retrieval: RetrievalService,
    private readonly logEntry: TranslationsRepository,
    private readonly pendingItems: PendingRepository,
    private readonly validatedPairs: ValidatedRepository,
  ) {}

  available(): boolean {
    return this.config.proveedor !== null;
  }

  configuration(): TranslatorConfig {
    return this.config;
  }

  async translate(
    dto: TranslateDto,
    options: TranslationOptions = {},
  ): Promise<TranslationResponseDto> {
    if (!this.config.proveedor) {
      throw new ServiceUnavailableException({
        codigo: 'SIN_PROVEEDOR',
        message: NO_PROVIDER_MESSAGE,
      });
    }

    const sourceLanguage =
      dto.direccion === TranslationDirection.damana_a_espanol ? Language.damana : Language.espanol;
    const context = this.retrieval.retrieveContext(dto.texto, sourceLanguage);

    const system = buildSystemPrompt(dto.direccion);
    const user = buildUserPrompt(dto.texto, dto.direccion, context);
    const start = Date.now();
    const { texto: text, uso: usageData } =
      this.config.proveedor === 'anthropic'
        ? await this.callAnthropic(system, user, responseSchema(dto.direccion))
        : await this.callCompatible(system, user);
    const durationMs = Date.now() - start;
    this.logger.log(this.usageSummary(dto.direccion, usageData, durationMs));
    const model = normalizeModelResponse(this.parseResponse(text));

    const signals = this.supportSignals(context.ejemplos);
    const response = this.buildResponse(model, context, signals);

    if (options.registrar !== false) {
      this.logTranslation(dto, response, signals, usageData, durationMs);
      this.recordPendingItems(dto, response.palabrasSinEquivalente);
    }
    return response;
  }

  /** One line per translation: to track spending and see whether the cache kicks in. */
  private usageSummary(direction: TranslationDirection, usageData: ModelUsage | null, durationMs: number): string {
    const header = `Traducción ${direction} con ${this.config.proveedor} ${this.config.modelo} en ${durationMs} ms`;
    if (!usageData) return `${header} · el proveedor no informó tokens`;
    const n = (v: number | null) => (v === null ? '?' : String(v));
    return (
      `${header} · tokens: entrada ${n(usageData.tokensEntrada)} ` +
      `(caché leída ${n(usageData.tokensCacheLeidos)}, creada ${n(usageData.tokensCacheCreados)}), salida ${n(usageData.tokensSalida)}`
    );
  }

  /** «This translation is correct» / «correct it»: stores the validated pair. */
  validate(dto: ValidateTranslationDto): SavedValidationDto {
    const toDamana = dto.direccion === TranslationDirection.espanol_a_damana;
    this.validatedPairs.save({
      espanol: (toDamana ? dto.texto : dto.traduccion).trim(),
      damana: (toDamana ? dto.traduccion : dto.texto).trim(),
      direccion: dto.direccion,
      origen: dto.origen,
      traduccionModelo: dto.traduccionModelo?.trim() || null,
    });
    return { guardada: true, total: this.validatedPairs.count() };
  }

  private buildResponse(
    model: ModelResponse,
    context: RetrievedContext,
    signals: SupportSignals,
  ): TranslationResponseDto {
    return {
      traduccion: model.traduccion,
      glosa: model.glosa,
      palabrasSinEquivalente: model.palabrasSinEquivalente,
      reglasAplicadas: model.reglasAplicadas,
      confianza: model.confianza,
      explicacionBreve: model.explicacionBreve,
      apoyo: evaluateSupport(signals),
      ejemplos: context.ejemplos.map((e) => ({
        fuente: e.fuente,
        dominio: e.dominio,
        referencia: e.referencia,
        damana: e.damana,
        espanol: e.espanol,
        puntaje: e.puntaje,
      })),
      diccionario: context.diccionario.map((a) => ({
        palabra: a.palabra,
        espanol: a.espanol,
        damana: a.damana,
        categoria: a.categoria,
        coincidencia: a.coincidencia,
      })),
      nombresPropios: context.nombresPropios,
      reglas: context.reglas.map((r) => ({
        forma: r.forma,
        significado: r.significado,
        ejemplo:
          r.ejemploBase && r.ejemploRegla
            ? `${r.ejemploBase} → ${r.ejemploRegla}${r.traduccionEjemplo ? ` = ${r.traduccionEjemplo}` : ''}`
            : null,
        disparador: r.disparador,
      })),
      disparadores: context.disparadores,
    };
  }

  /**
   * How much the corpus backs this translation. Examples come
   * grouped by domain, so the «top» is the maximum, not the first.
   */
  private supportSignals(examples: RetrievedFragment[]): SupportSignals {
    const top = examples.reduce<RetrievedFragment | null>(
      (best, e) => (best === null || e.puntaje > best.puntaje ? e : best),
      null,
    );
    return {
      puntajeMedio: examples.length
        ? examples.reduce((sum, e) => sum + e.puntaje, 0) / examples.length
        : 0,
      fuenteTop: top?.fuente ?? null,
      ejemplosRecuperados: examples.length,
      ejemplosEnContexto: examples.filter(
        (e) => e.fuente === CorpusSource.oraciones || e.fuente === CorpusSource.frases,
      ).length,
    };
  }

  /**
   * Stores the translation and its support signals. Best-effort on purpose:
   * a logging failure must NEVER stop the user from receiving their
   * translation, which is what they came for.
   */
  private logTranslation(
    dto: TranslateDto,
    response: TranslationResponseDto,
    signals: SupportSignals,
    usageData: ModelUsage | null,
    durationMs: number,
  ): void {
    try {
      this.logEntry.record({
        texto: dto.texto,
        traduccion: response.traduccion,
        direccion: dto.direccion,
        puntajeTop: response.ejemplos.reduce((max, e) => Math.max(max, e.puntaje), 0),
        puntajeMedio: signals.puntajeMedio,
        fuenteTop: signals.fuenteTop,
        ejemplosRecuperados: signals.ejemplosRecuperados,
        ejemplosEnContexto: signals.ejemplosEnContexto ?? 0,
        palabrasDudosas: response.palabrasSinEquivalente,
        vocabularioUsado: response.diccionario.map((a) => ({ espanol: a.espanol, damana: a.damana })),
        modelo: this.config.modelo,
        confianza: response.confianza,
        reglasAplicadas: response.reglasAplicadas,
        glosa: response.glosa,
        uso: usageData,
        duracionMs: durationMs,
      });
    } catch (error) {
      this.logger.warn(`No se pudo registrar la traducción: ${messageOf(error)}`);
    }
  }

  /** Closes the loop with the speakers: what was missing gets noted down. */
  private recordPendingItems(dto: TranslateDto, words: string[]): void {
    const language = dto.direccion === TranslationDirection.espanol_a_damana ? 'espanol' : 'damana';
    // Articles and other Spanish function words are not
    // missing vocabulary: Damana does not have them. If the model leaves them
    // in square brackets they are shown, but the speakers are not asked about them.
    const toRecord =
      language === 'espanol' ? words.filter((p) => !isSpanishStopword(normalize(p))) : words;
    if (toRecord.length === 0) return;
    const context = dto.texto.replace(/\s+/g, ' ').trim().slice(0, MAX_PENDING_CONTEXT);
    for (const word of toRecord) {
      try {
        this.pendingItems.recordRequested(word, language, context);
      } catch (error) {
        this.logger.warn(`No se pudo registrar la pendiente «${word}»: ${messageOf(error)}`);
      }
    }
  }

  /**
   * Claude via the official SDK, with structured output (output_config.format
   * with the response's JSON Schema) so that the JSON arrives well formed.
   */
  private async callAnthropic(
    system: string,
    user: string,
    schema: Record<string, unknown>,
  ): Promise<ModelOutput> {
    try {
      const response = await this.client!.messages.create({
        model: this.config.modelo,
        max_tokens: MAX_TOKENS_ANTHROPIC,
        // The system prompt is identical across all translations in the
        // same direction: it is marked for Anthropic's prompt cache
        // (minimum prefix of 512 tokens on claude-opus-5-5; this prompt
        // is around 750). The cache lasts 5 min between calls: it kicks in during
        // bursts (evaluations, work sessions), not on one-off
        // translations. The user message changes with every sentence (dictionary,
        // rules and examples depend on it), so it has no stable
        // prefix to mark.
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: user }],
        // No temperature: claude-opus-5-5 rejects it with a 400 (see
        // translator-config.provider.ts). The effort is only sent if it was
        // configured; otherwise the API's default value applies.
        output_config: {
          format: { type: 'json_schema', schema: schema },
          ...(this.config.esfuerzo ? { effort: this.config.esfuerzo } : {}),
        },
      });
      if (response.stop_reason === 'refusal') {
        throw new BadGatewayException(
          'El modelo rechazó la petición por sus filtros de seguridad. Reformula el texto e intenta de nuevo.',
        );
      }
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      );
      if (!textBlock) {
        throw new BadGatewayException(
          'El modelo no devolvió texto (¿respuesta cortada?). Intenta de nuevo.',
        );
      }
      return { texto: textBlock.text, uso: usageFromAnthropic(response.usage) };
    } catch (error) {
      throw this.mapAnthropicError(error);
    }
  }

  /**
   * Calls any OpenAI-compatible API (Ollama, Gemini, Groq,
   * Hugging Face router...) using native fetch: POST {base}/chat/completions.
   * response_format json_object is requested; if the provider does not support it
   * (400) it retries without it and relies on extractJson. On a 429 it waits
   * and retries up to RETRIES_429 times before giving up.
   */
  private async callCompatible(
    system: string,
    user: string,
    withJsonFormat = true,
    attempt = 0,
  ): Promise<ModelOutput> {
    const url = `${this.config.baseUrl!.replace(/\/+$/, '')}/chat/completions`;
    const control = new AbortController();
    const timer = setTimeout(() => control.abort(), modelTimeoutMs());

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.config.modelo,
          max_tokens: MAX_TOKENS_COMPATIBLE,
          temperature: this.config.temperatura ?? DEFAULT_TEMPERATURE,
          ...(withJsonFormat ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: control.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GatewayTimeoutException(
          `La traducción superó el tiempo de espera (${Math.round(modelTimeoutMs() / 1000)} s). ` +
            'Con modelos locales puedes ampliarlo con TRADUCTOR_TIMEOUT_MS.',
        );
      }
      throw new GatewayTimeoutException(
        `No se pudo conectar con ${this.config.baseUrl}. ` +
          '¿Está corriendo el proveedor (p. ej. Ollama) y la URL es correcta?',
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 400 && withJsonFormat) {
      return this.callCompatible(system, user, false, attempt);
    }
    if (response.status === 429 && attempt < RETRIES_429) {
      const wait = waitAfterLimit(response.headers?.get?.('retry-after'));
      this.logger.warn(
        `El proveedor devolvió 429; se reintenta en ${Math.round(wait / 1000)} s ` +
          `(intento ${attempt + 1} de ${RETRIES_429}).`,
      );
      await clock.dormir(wait);
      return this.callCompatible(system, user, withJsonFormat, attempt + 1);
    }
    if (response.status === 401 || response.status === 403) {
      throw new BadGatewayException(
        'El proveedor rechazó la clave TRADUCTOR_API_KEY. Revísala y reinicia el backend.',
      );
    }
    if (response.status === 429) {
      throw new HttpException(
        'El proveedor devolvió un límite de uso (429). Espera un momento y reintenta.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (response.status === 404) {
      throw new BadGatewayException(
        `El proveedor no encontró el modelo "${this.config.modelo}" (404). ` +
          'Revisa TRADUCTOR_MODELO (con Ollama: ¿hiciste "ollama pull <modelo>"?).',
      );
    }
    if (!response.ok) {
      throw new BadGatewayException(`El proveedor devolvió un error (${response.status}).`);
    }

    const json = (await response.json().catch(() => null)) as {
      choices?: { message?: { content?: unknown } }[];
      usage?: UsageCompatible;
    } | null;
    const text = json?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.length === 0) {
      throw new BadGatewayException(
        'El proveedor no devolvió texto en el formato esperado (choices[0].message.content).',
      );
    }
    return { texto: text, uso: usageFromCompatible(json?.usage) };
  }

  /** Maps the Anthropic SDK's typed errors to clear HTTP errors. */
  private mapAnthropicError(error: unknown): Error {
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
    return new BadGatewayException(`Error inesperado al traducir: ${messageOf(error)}`);
  }

  private parseResponse(text: string): Record<string, unknown> {
    try {
      return extractJson(text);
    } catch {
      throw new BadGatewayException(
        'El modelo no devolvió el JSON esperado. Reintenta la traducción.',
      );
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
