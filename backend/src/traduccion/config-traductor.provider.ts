import { Provider } from '@nestjs/common';

export const CONFIG_TRADUCTOR = 'CONFIG_TRADUCTOR';

export const MODELO_CLAUDE = 'claude-sonnet-4-6';

/** Timeout de la llamada al modelo; ampliable con TRADUCTOR_TIMEOUT_MS
 *  (útil para modelos locales tipo Ollama, más lentos que una API). */
export function timeoutModeloMs(): number {
  const valor = Number(process.env.TRADUCTOR_TIMEOUT_MS);
  return Number.isFinite(valor) && valor > 0 ? valor : 60_000;
}

export type ProveedorTraductor = 'anthropic' | 'compatible';

export interface ConfigTraductor {
  proveedor: ProveedorTraductor | null;
  modelo: string;
  /** Solo proveedor 'compatible': base de la API estilo OpenAI (sin /chat/completions). */
  baseUrl?: string;
  /** Solo proveedor 'compatible': clave Bearer; opcional (Ollama no la necesita). */
  apiKey?: string;
}

/**
 * Selección del motor de traducción por variables de entorno:
 *
 * 1. ANTHROPIC_API_KEY            → Claude (claude-sonnet-4-6), prioridad.
 * 2. TRADUCTOR_BASE_URL + TRADUCTOR_MODELO [+ TRADUCTOR_API_KEY]
 *    → cualquier API compatible con OpenAI: Google Gemini, Groq, Ollama
 *      local, Hugging Face router, etc.
 * 3. Nada configurado             → el traductor responde 503 con ayuda.
 */
export const configTraductorProvider: Provider = {
  provide: CONFIG_TRADUCTOR,
  useFactory: (): ConfigTraductor => {
    if (process.env.ANTHROPIC_API_KEY) {
      return { proveedor: 'anthropic', modelo: MODELO_CLAUDE };
    }
    const baseUrl = process.env.TRADUCTOR_BASE_URL;
    const modelo = process.env.TRADUCTOR_MODELO;
    if (baseUrl && modelo) {
      return {
        proveedor: 'compatible',
        modelo,
        baseUrl,
        apiKey: process.env.TRADUCTOR_API_KEY,
      };
    }
    return { proveedor: null, modelo: '' };
  },
};
