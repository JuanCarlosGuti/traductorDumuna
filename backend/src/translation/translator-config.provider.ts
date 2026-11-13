import { readEnv } from '../common/env';
import { Logger, Provider } from '@nestjs/common';

export const TRANSLATOR_CONFIG = 'TRANSLATOR_CONFIG';

/**
 * Default Claude model (Oct 2026). It can be changed without touching
 * code via ANTHROPIC_MODEL (e.g. claude-sonnet-5-5 to cut costs).
 */
export const CLAUDE_MODEL = 'claude-opus-5-5';

/** Timeout of the model call; can be extended with TRANSLATOR_TIMEOUT_MS
 *  (useful for local models such as Ollama, slower than an API). */
export function modelTimeoutMs(): number {
  const value = Number(readEnv('TRANSLATOR_TIMEOUT_MS'));
  return Number.isFinite(value) && value > 0 ? value : 60_000;
}

export type TranslatorProvider = 'anthropic' | 'compatible';

/** Reasoning effort levels accepted by the Anthropic API. */
export const ANTHROPIC_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type AnthropicEffort = (typeof ANTHROPIC_EFFORTS)[number];

/**
 * Default temperature of the compatible provider. Low on purpose: we
 * want the same translation for the same sentence, not variety. It is changed
 * with TRANSLATOR_TEMPERATURE (from 0 to 2).
 *
 * It does not apply to Claude: claude-opus-5-5 (like the whole family from 4.7
 * onwards) rejects temperature/top_p/top_k with a 400; adaptive
 * thinking decides by itself. There the only control is ANTHROPIC_EFFORT
 * (output_config.effort), which if missing is left at the API's value.
 */
export const DEFAULT_TEMPERATURE = 0.2;

export function readTemperature(value = readEnv('TRANSLATOR_TEMPERATURE')): number {
  if (value === undefined || value.trim() === '') return DEFAULT_TEMPERATURE;
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_TEMPERATURE;
  return Math.min(2, Math.max(0, n));
}

export function readEffort(value = readEnv('ANTHROPIC_EFFORT')): AnthropicEffort | undefined {
  const v = value?.trim().toLowerCase() ?? '';
  if (v === '') return undefined;
  if ((ANTHROPIC_EFFORTS as readonly string[]).includes(v)) return v as AnthropicEffort;
  new Logger('TranslatorConfig').warn(
    `ANTHROPIC_EFFORT="${value}" is not valid (${ANTHROPIC_EFFORTS.join(', ')}); the API default is used.`,
  );
  return undefined;
}

export interface TranslatorConfig {
  provider: TranslatorProvider | null;
  model: string;
  /** 'compatible' provider only: base of the OpenAI-style API (without /chat/completions). */
  baseUrl?: string;
  /** 'compatible' provider only: Bearer key; optional (Ollama does not need it). */
  apiKey?: string;
  /** 'compatible' provider only: sampling temperature (TRANSLATOR_TEMPERATURE; 0.2 if missing). */
  temperature?: number;
  /** 'anthropic' provider only: output_config.effort (ANTHROPIC_EFFORT); if missing, the API's. */
  effort?: AnthropicEffort;
}

/**
 * Translation engine selection via environment variables:
 *
 * 1. ANTHROPIC_API_KEY [+ ANTHROPIC_MODEL] → Claude via the official SDK, priority.
 * 2. TRANSLATOR_BASE_URL + TRANSLATOR_MODEL [+ TRANSLATOR_API_KEY]
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
        provider: 'anthropic',
        model: readEnv('ANTHROPIC_MODEL')?.trim() || CLAUDE_MODEL,
        ...(effort ? { effort: effort } : {}),
      };
    }
    const baseUrl = readEnv('TRANSLATOR_BASE_URL');
    const model = readEnv('TRANSLATOR_MODEL');
    if (baseUrl && model) {
      return {
        provider: 'compatible',
        model: model,
        baseUrl,
        apiKey: readEnv('TRANSLATOR_API_KEY'),
        temperature: readTemperature(),
      };
    }
    return { provider: null, model: '' };
  },
};
