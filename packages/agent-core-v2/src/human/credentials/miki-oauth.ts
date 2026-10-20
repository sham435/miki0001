import type { BearerTokenProvider } from '@mymoon-ai/miki-code-oauth';

import { createOAuthCredentialProvider } from '#/credentials/credentials';
import type { LlmCredentialProvider } from '#/llm/requester/requester';

export function createMikiOAuthCredentialProvider(tokens: BearerTokenProvider): LlmCredentialProvider {
  return createOAuthCredentialProvider((options) => tokens.getAccessToken(options));
}
