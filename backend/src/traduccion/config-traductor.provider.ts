import { Logger, Provider } from '@nestjs/common';

export const CONFIG_TRADUCTOR = 'CONFIG_TRADUCTOR';

/**
 * Modelo de Claude por defecto (oct 2026). Se puede cambiar sin tocar
 * código con ANTHROPIC_MODELO (p. ej. claude-sonnet-5-5 para abaratar).
 */
export const MODELO_CLAUDE = 'claude-opus-5-5';

/** Timeout de la llamada al modelo; ampliable con TRADUCTOR_TIMEOUT_MS
 *  (útil para modelos locales tipo Ollama, más lentos que una API). */
export function timeoutModeloMs(): number {
  const valor = Number(process.env.TRADUCTOR_TIMEOUT_MS);
  return Number.isFinite(valor) && valor > 0 ? valor : 60_000;
}

export type ProveedorTraductor = 'anthropic' | 'compatible';

/** Niveles de esfuerzo de razonamiento que admite la API de Anthropic. */
export const ESFUERZOS_ANTHROPIC = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type EsfuerzoAnthropic = (typeof ESFUERZOS_ANTHROPIC)[number];

/**
 * Temperatura por defecto del proveedor compatible. Baja a propósito: se
 * quiere la misma traducción para la misma frase, no variedad. Se cambia
 * con TRADUCTOR_TEMPERATURA (de 0 a 2).
 *
 * No aplica a Claude: claude-opus-5-5 (como toda la familia 4.7 en
 * adelante) rechaza temperature/top_p/top_k con un 400; el pensamiento
 * adaptativo decide solo. Ahí el único mando es ANTHROPIC_ESFUERZO
 * (output_config.effort), que si falta se deja al valor de la API.
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
  /** Solo proveedor 'compatible': base de la API estilo OpenAI (sin /chat/completions). */
  baseUrl?: string;
  /** Solo proveedor 'compatible': clave Bearer; opcional (Ollama no la necesita). */
  apiKey?: string;
  /** Solo proveedor 'compatible': temperatura de muestreo (TRADUCTOR_TEMPERATURA; 0.2 si falta). */
  temperatura?: number;
  /** Solo proveedor 'anthropic': output_config.effort (ANTHROPIC_ESFUERZO); si falta, el de la API. */
  esfuerzo?: EsfuerzoAnthropic;
}

/**
 * Selección del motor de traducción por variables de entorno:
 *
 * 1. ANTHROPIC_API_KEY [+ ANTHROPIC_MODELO] → Claude vía el SDK oficial, prioridad.
 * 2. TRADUCTOR_BASE_URL + TRADUCTOR_MODELO [+ TRADUCTOR_API_KEY]
 *    → cualquier API compatible con OpenAI: Groq (producción), Google
 *      Gemini, Ollama local, Hugging Face router, etc.
 * 3. Nada configurado             → el traductor responde 503 con ayuda.
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
