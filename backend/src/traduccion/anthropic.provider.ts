import Anthropic from '@anthropic-ai/sdk';
import { Provider } from '@nestjs/common';
import { timeoutModeloMs } from './config-traductor.provider';

export const CLIENTE_ANTHROPIC = 'CLIENTE_ANTHROPIC';

/**
 * Official @anthropic-ai/sdk client, or null if there is no ANTHROPIC_API_KEY.
 * The app still starts without the key: the translator can use an
 * OpenAI-compatible provider (see config-traductor.provider.ts) or answer
 * 503 with instructions.
 */
export const clienteAnthropicProvider: Provider = {
  provide: CLIENTE_ANTHROPIC,
  useFactory: (): Anthropic | null =>
    process.env.ANTHROPIC_API_KEY
      ? new Anthropic({
          // TypeScript SDK timeout: in milliseconds
          timeout: timeoutModeloMs(),
          maxRetries: 1,
        })
      : null,
};
