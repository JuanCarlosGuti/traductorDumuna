import { Logger, Provider } from '@nestjs/common';

export const CONFIG_TRADUCTOR = 'CONFIG_TRADUCTOR';

/**
 * Default Claude model (Oct 2026). It can be changed without touching
 * code via ANTHROPIC_MODELO (e.g. claude-sonnet-5-5 to cut costs).
 */
export const MODELO_CLAUDE = 'claude-opus-5-5';

/** Timeout of the model call; can be extended with TRADUCTOR_TIMEOUT_MS
 *  (useful for local models such as Ollama, slower than an API). */
export function timeoutModeloMs(): number {
  const valor = Number(process.env.TRADUCTOR_TIMEOUT_MS);
  return Number.isFinite(valor) && valor > 0 ? valor : 60_000;
}

export type ProveedorTraductor = 'anthropic' | 'compatible';

/** Reasoning effort levels accepted by the Anthropic API. */
export const ESFUERZOS_ANTHROPIC = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type EsfuerzoAnthropic = (typeof ESFUERZOS_ANTHROPIC)[number];

/**
 * Default temperature of the compatible provider. Low on purpose: we
 * want the same translation for the same sentence, not variety. It is changed
 * with TRADUCTOR_TEMPERATURA (from 0 to 2).
 *
 * It does not apply to Claude: claude-opus-5-5 (like the whole family from 4.7
 * onwards) rejects temperature/top_p/top_k with a 400; adaptive
 * thinking decides by itself. There the only control is ANTHROPIC_ESFUERZO
 * (output_config.effort), which if missing is left at the API's value.
 */
export const TEMPERATURA_POR_DEFECTO = 0.2;

export function leerTemperatura(valor = process.env.TRADUCTOR_TEMPERATURA): number {
  if (valor === undefined || valor.trim() === '') return TEMPERATURA_POR_DEFECTO;
  const n = Number(valor);
  if (!Number.isFinite(n)) return TEMPERATURA_POR_DEFECTO;
  return Math.min(2, Math.max(0, n));
}

export function leerEsfuerzo(valor = process.env.ANTHROPIC_ESFUERZO): EsfuerzoAnthropic | undefined {
  const v = valor?.trim().toLowerCase() ?? '';
  if (v === '') return undefined;
  if ((ESFUERZOS_ANTHROPIC as readonly string[]).includes(v)) return v as EsfuerzoAnthropic;
  new Logger('ConfigTraductor').warn(
    `ANTHROPIC_ESFUERZO="${valor}" no es válido (${ESFUERZOS_ANTHROPIC.join(', ')}); se deja el de la API.`,
  );
  return undefined;
}

export interface ConfigTraductor {
  proveedor: ProveedorTraductor | null;
  modelo: string;
  /** 'compatible' provider only: base of the OpenAI-style API (without /chat/completions). */
  baseUrl?: string;
  /** 'compatible' provider only: Bearer key; optional (Ollama does not need it). */
  apiKey?: string;
  /** 'compatible' provider only: sampling temperature (TRADUCTOR_TEMPERATURA; 0.2 if missing). */
  temperatura?: number;
  /** 'anthropic' provider only: output_config.effort (ANTHROPIC_ESFUERZO); if missing, the API's. */
  esfuerzo?: EsfuerzoAnthropic;
}

/**
 * Translation engine selection via environment variables:
 *
 * 1. ANTHROPIC_API_KEY [+ ANTHROPIC_MODELO] → Claude via the official SDK, priority.
 * 2. TRADUCTOR_BASE_URL + TRADUCTOR_MODELO [+ TRADUCTOR_API_KEY]
 *    → any OpenAI-compatible API: Groq (production), Google
 *      Gemini, local Ollama, Hugging Face router, etc.
 * 3. Nothing configured           → the translator answers 503 with help.
 */
export const configTraductorProvider: Provider = {
  provide: CONFIG_TRADUCTOR,
  useFactory: (): ConfigTraductor => {
    if (process.env.ANTHROPIC_API_KEY) {
      const esfuerzo = leerEsfuerzo();
      return {
        proveedor: 'anthropic',
        modelo: process.env.ANTHROPIC_MODELO?.trim() || MODELO_CLAUDE,
        ...(esfuerzo ? { esfuerzo } : {}),
      };
    }
    const baseUrl = process.env.TRADUCTOR_BASE_URL;
    const modelo = process.env.TRADUCTOR_MODELO;
    if (baseUrl && modelo) {
      return {
        proveedor: 'compatible',
        modelo,
        baseUrl,
        apiKey: process.env.TRADUCTOR_API_KEY,
        temperatura: leerTemperatura(),
      };
    }
    return { proveedor: null, modelo: '' };
  },
};
