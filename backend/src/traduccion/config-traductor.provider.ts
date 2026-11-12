import { Logger, Provider } from '@nestjs/common';

export const TRANSLATOR_CONFIG = 'CONFIG_TRADUCTOR';

/**
 * Default Claude model (Oct 2026). It can be changed without touching
 * code via ANTHROPIC_MODELO (e.g. claude-sonnet-5-5 to cut costs).
 */
export const CLAUDE_MODEL = 'claude-opus-5-5';

/** Timeout of the model call; can be extended with TRADUCTOR_TIMEOUT_MS
 *  (useful for local models such as Ollama, slower than an API). */
export function modelTimeoutMs(): number {
  const value = Number(process.env.TRADUCTOR_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 60_000;
}

export type TranslatorProvider = 'anthropic' | 'compatible';

/** Reasoning effort levels accepted by the Anthropic API. */
export const ANTHROPIC_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type AnthropicEffort = (typeof ANTHROPIC_EFFORTS)[number];

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
export const DEFAULT_TEMPERATURE = 0.2;

export function readTemperature(value = process.env.TRADUCTOR_TEMPERATURA): number {
  if (value === undefined || value.trim() === '') return DEFAULT_TEMPERATURE;
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_TEMPERATURE;
  return Math.min(2, Math.max(0, n));
}

export function readEffort(value = process.env.ANTHROPIC_ESFUERZO): AnthropicEffort | undefined {
  const v = value?.trim().toLowerCase() ?? '';
  if (v === '') return undefined;
  if ((ANTHROPIC_EFFORTS as readonly string[]).includes(v)) return v as AnthropicEffort;
  new Logger('ConfigTraductor').warn(
    `ANTHROPIC_ESFUERZO="${value}" no es válido (${ANTHROPIC_EFFORTS.join(', ')}); se deja el de la API.`,
  );
  return undefined;
}

export interface TranslatorConfig {
  proveedor: TranslatorProvider | null;
  modelo: string;
  /** 'compatible' provider only: base of the OpenAI-style API (without /chat/completions). */
  baseUrl?: string;
  /** 'compatible' provider only: Bearer key; optional (Ollama does not need it). */
  apiKey?: string;
  /** 'compatible' provider only: sampling temperature (TRADUCTOR_TEMPERATURA; 0.2 if missing). */
  temperatura?: number;
  /** 'anthropic' provider only: output_config.effort (ANTHROPIC_ESFUERZO); if missing, the API's. */
  esfuerzo?: AnthropicEffort;
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
export const translatorConfigProvider: Provider = {
  provide: TRANSLATOR_CONFIG,
  useFactory: (): TranslatorConfig => {
    if (process.env.ANTHROPIC_API_KEY) {
      const effort = readEffort();
      return {
        proveedor: 'anthropic',
        modelo: process.env.ANTHROPIC_MODELO?.trim() || CLAUDE_MODEL,
        ...(effort ? { esfuerzo: effort } : {}),
      };
    }
    const baseUrl = process.env.TRADUCTOR_BASE_URL;
    const model = process.env.TRADUCTOR_MODELO;
    if (baseUrl && model) {
      return {
        proveedor: 'compatible',
        modelo: model,
        baseUrl,
        apiKey: process.env.TRADUCTOR_API_KEY,
        temperatura: readTemperature(),
      };
    }
    return { proveedor: null, modelo: '' };
  },
};
