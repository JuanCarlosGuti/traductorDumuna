import Anthropic from '@anthropic-ai/sdk';
import { Provider } from '@nestjs/common';
import { modelTimeoutMs } from './config-traductor.provider';

export const ANTHROPIC_CLIENT = 'CLIENTE_ANTHROPIC';

/**
 * Official @anthropic-ai/sdk client, or null if there is no ANTHROPIC_API_KEY.
 * The app still starts without the key: the translator can use an
 * OpenAI-compatible provider (see config-traductor.provider.ts) or answer
 * 503 with instructions.
 */
export const anthropicClientProvider: Provider = {
  provide: ANTHROPIC_CLIENT,
  useFactory: (): Anthropic | null =>
    process.env.ANTHROPIC_API_KEY
      ? new Anthropic({
          // TypeScript SDK timeout: in milliseconds
          timeout: modelTimeoutMs(),
          maxRetries: 1,
        })
      : null,
};
