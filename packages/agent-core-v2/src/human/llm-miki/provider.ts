import { createProvider } from '#/llm/provider/definition';
import { anthropicBetaBase } from '#/llm/requester/bases/anthropic/requester';
import { openAIBase } from '#/llm/requester/bases/openai/requester';
import { openAIResponsesBase } from '#/llm/requester/bases/openai-responses/requester';

import { mikiAnthropicTrait, mikiConnection, mikiOpenAITrait, mikiResponsesTrait } from './trait';
import { classifyMikiQuotaError } from './errors';
import { mikiMediaContribution } from './media';

export const mikiProvider = createProvider({
  id: 'miki',
  protocols: {
    openai: {
      base: openAIBase,
      trait: mikiOpenAITrait,
      connection: mikiConnection,
      classifyError: classifyMikiQuotaError,
    },
    anthropic: {
      base: anthropicBetaBase,
      trait: mikiAnthropicTrait,
      connection: mikiConnection,
      classifyError: classifyMikiQuotaError,
    },
    openai_responses: {
      base: openAIResponsesBase,
      trait: mikiResponsesTrait,
      connection: mikiConnection,
      classifyError: classifyMikiQuotaError,
    },
  },
  media: mikiMediaContribution,
});
