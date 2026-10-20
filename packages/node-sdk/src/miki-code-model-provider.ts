import {
  createMikiDefaultHeaders,
  MIKI_CODE_FLOW_CONFIG,
  MIKI_CODE_PROVIDER_NAME,
  MikiOAuthToolkit,
  mikiCodeBaseUrl,
  parseMikiCodeCustomHeaders,
  resolveMikiCodeOAuthRef,
  type MikiHostIdentity,
  type ManagedMikiOAuthRef,
} from '@mymoon-ai/miki-code-oauth';
import type {
  ProviderConfig as KosongProviderConfig,
  ProviderRequestAuth,
} from '@mymoon-ai/kosong';
import { APIStatusError, UNKNOWN_CAPABILITY } from '@mymoon-ai/kosong';
import { resolveMikiHome } from '@mymoon-ai/agent-core-v2';

import { ErrorCodes, MikiError } from '#/errors';
import type { Logger } from '#/logging/index';
import type { ModelProvider, ResolvedRuntimeProvider } from '#/model-provider';
import { mapOAuthTokenError } from '#/oauth-error';

export interface MikiForCodingProviderOptions extends MikiHostIdentity {
  readonly homeDir?: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly promptCacheKey?: string;
  readonly defaultHeaders?: Record<string, string>;
}

export class MikiForCodingProvider implements ModelProvider {
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly promptCacheKey: string | undefined;
  private readonly defaultHeaders: Record<string, string> | undefined;
  private readonly toolkit: MikiOAuthToolkit;
  private readonly homeDir: string;
  private readonly identity: MikiHostIdentity;
  private readonly oauthRef: ManagedMikiOAuthRef;

  constructor(options: MikiForCodingProviderOptions) {
    this.model = options.model ?? 'miki-for-coding';
    this.baseUrl = options.baseUrl ?? mikiCodeBaseUrl();
    this.promptCacheKey = options.promptCacheKey;
    this.defaultHeaders = options.defaultHeaders;
    this.homeDir = resolveMikiHome(options.homeDir);
    this.identity = {
      productName: options.productName,
      version: options.version,
      platform: options.platform,
      userAgentSuffix: options.userAgentSuffix,
    };
    this.oauthRef = resolveMikiCodeOAuthRef({
      oauthHost: MIKI_CODE_FLOW_CONFIG.oauthHost,
      baseUrl: this.baseUrl,
    });
    this.toolkit = new MikiOAuthToolkit({
      homeDir: this.homeDir,
      identity: this.identity,
    });
  }

  get defaultModel(): string {
    return this.model;
  }

  resolveProviderConfig(model: string): ResolvedRuntimeProvider {
    if (model !== this.model) {
      throw new MikiError(
        ErrorCodes.CONFIG_INVALID,
        `Model "${model}" is not supported by MikiForCodingProvider.`,
      );
    }

    const provider: KosongProviderConfig = {
      type: 'miki',
      model: this.model,
      baseUrl: this.baseUrl,
      generationKwargs: this.promptCacheKey
        ? { prompt_cache_key: this.promptCacheKey }
        : undefined,
      defaultHeaders: {
        ...parseMikiCodeCustomHeaders(),
        ...createMikiDefaultHeaders({
          homeDir: this.homeDir,
          ...this.identity,
        }),
        ...this.defaultHeaders,
      },
    };

    return {
      providerName: 'miki-for-coding',
      provider,
      modelCapabilities: UNKNOWN_CAPABILITY,
      type: 'miki',
      protocol: undefined,
    };
  }

  resolveAuth(_model: string, _options?: { readonly log?: Logger }) {
    return async <T>(request: (auth: ProviderRequestAuth) => Promise<T>): Promise<T> => {
      let auth = await this.buildAuth(false);
      for (let refreshed = false; ; refreshed = true) {
        try {
          return await request(auth);
        } catch (error) {
          const is401 = error instanceof APIStatusError && error.statusCode === 401;
          if (!is401) throw error;
          if (refreshed) {
            throw new MikiError(
              ErrorCodes.AUTH_LOGIN_REQUIRED,
              'OAuth token was rejected after refresh. Run /login to re-authenticate.',
              { cause: error },
            );
          }
          auth = await this.buildAuth(true);
        }
      }
    };
  }

  private async buildAuth(force: boolean): Promise<ProviderRequestAuth> {
    try {
      const apiKey = await this.toolkit.ensureFresh(MIKI_CODE_PROVIDER_NAME, {
        force,
        oauthRef: this.oauthRef,
      });
      return { apiKey };
    } catch (error) {
      // Classify OAuth token failures into the public MikiError protocol so the
      // turn surfaces `auth.login_required` / `provider.connection_error`
      // instead of collapsing everything to `internal`. Unrecognized errors are
      // rethrown raw (see mapOAuthTokenError).
      throw mapOAuthTokenError(error, MIKI_CODE_PROVIDER_NAME) ?? error;
    }
  }
}
