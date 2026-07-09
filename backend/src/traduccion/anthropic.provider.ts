import Anthropic from '@anthropic-ai/sdk';
import { Provider } from '@nestjs/common';
import { timeoutModeloMs } from './config-traductor.provider';

export const CLIENTE_ANTHROPIC = 'CLIENTE_ANTHROPIC';

/**
 * Cliente oficial @anthropic-ai/sdk, o null si no hay ANTHROPIC_API_KEY.
 * La app arranca igual sin la clave: el traductor puede usar un proveedor
 * compatible con OpenAI (ver config-traductor.provider.ts) o responder
 * 503 con instrucciones.
 */
export const clienteAnthropicProvider: Provider = {
  provide: CLIENTE_ANTHROPIC,
  useFactory: (): Anthropic | null =>
    process.env.ANTHROPIC_API_KEY
      ? new Anthropic({
          // timeout del SDK de TypeScript: en milisegundos
          timeout: timeoutModeloMs(),
          maxRetries: 1,
        })
      : null,
};
