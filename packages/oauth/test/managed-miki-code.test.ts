import { describe, expect, it, vi } from 'vitest';

import {
  applyManagedApiKeyProviderModels,
  applyManagedMikiCodeLogoutConfig,
  applyManagedMikiCodeConfig,
  clearManagedMikiCodeConfig,
  fetchManagedMikiCodeModels,
  MIKI_CODE_OAUTH_KEY,
  MIKI_CODE_PROVIDER_NAME,
  ManagedMikiCodeModelsAuthError,
  provisionManagedMikiCodeConfig,
  resolveMikiCodeLoginAuth,
  resolveMikiCodeOAuthKey,
  resolveMikiCodeOAuthRef,
  resolveMikiCodeRuntimeAuth,
  type ManagedMikiCodeModelInfo,
  type ManagedMikiConfigShape,
} from '../src/managed-miki-code';
import { OAuthUnauthorizedError } from '../src/errors';

function makeModelsResponse(): Response {
  return new Response(
    JSON.stringify({
      data: [
        {
          id: 'miki-for-coding',
          limit: { context: 262144 },
          modalities: { input: ['text', 'image', 'video'], output: ['text'] },
          reasoning: { type: 'both' },
          display_name: 'Miki for Coding',
        },
        {
          id: 'miki-k2.5',
          limit: { context: 250000 },
          supports_tool_use: false,
        },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('provisionManagedMikiCodeConfig', () => {
  it('keeps the legacy credential key for the default production environment', () => {
    expect(
      resolveMikiCodeOAuthKey({
        oauthHost: 'https://auth.miki.com/',
        baseUrl: 'https://api.miki.com/coding/v1/',
      }),
    ).toBe(MIKI_CODE_OAUTH_KEY);
  });

  it('scopes credential keys for non-default OAuth hosts and API base URLs', () => {
    const devKey = resolveMikiCodeOAuthKey({
      oauthHost: 'https://auth.dev.example.test',
      baseUrl: 'https://api.dev.example.test/coding/v1',
    });

    expect(devKey).not.toBe(MIKI_CODE_OAUTH_KEY);
    expect(devKey).toMatch(/^oauth\/miki-code-env-[a-f0-9]{16}$/);
    expect(
      resolveMikiCodeOAuthKey({
        oauthHost: 'https://auth.dev.example.test/',
        baseUrl: 'https://api.dev.example.test/coding/v1/',
      }),
    ).toBe(devKey);
  });

  it('derives a full OAuth ref whose key and persisted host stay in sync', () => {
    // Default environment collapses to the legacy ref (no persisted host), so
    // existing production credentials keep resolving to `miki-code.json`.
    expect(
      resolveMikiCodeOAuthRef({
        oauthHost: 'https://auth.miki.com/',
        baseUrl: 'https://api.miki.com/coding/v1/',
      }),
    ).toEqual({ storage: 'file', key: MIKI_CODE_OAUTH_KEY, oauthHost: undefined });

    const defaultAuthCustomApiRef = resolveMikiCodeOAuthRef({
      baseUrl: 'https://api.example.test/coding/v1',
    });
    expect(defaultAuthCustomApiRef).toEqual({
      storage: 'file',
      key: resolveMikiCodeOAuthKey({
        oauthHost: 'https://auth.miki.com',
        baseUrl: 'https://api.example.test/coding/v1',
      }),
      oauthHost: 'https://auth.miki.com',
    });

    // A non-default environment yields a scoped key AND the normalized host,
    // both derived from the same input — login and runtime cannot drift apart.
    const devRef = resolveMikiCodeOAuthRef({
      oauthHost: 'https://auth.dev.example.test/',
      baseUrl: 'https://api.dev.example.test/coding/v1',
    });
    expect(devRef).toEqual({
      storage: 'file',
      key: resolveMikiCodeOAuthKey({
        oauthHost: 'https://auth.dev.example.test',
        baseUrl: 'https://api.dev.example.test/coding/v1',
      }),
      oauthHost: 'https://auth.dev.example.test',
    });
  });

  it('resolves runtime auth from environment overrides over persisted config', () => {
    const configuredBaseUrl = 'https://api.configured.example.test/coding/v1';
    const envBaseUrl = 'https://api.env.example.test/coding/v1/';
    const envOauthHost = 'https://auth.env.example.test/';
    const configuredOAuthRef = resolveMikiCodeOAuthRef({
      baseUrl: configuredBaseUrl,
    });

    const auth = resolveMikiCodeRuntimeAuth({
      configuredBaseUrl,
      configuredOAuthRef,
      env: {
        MIKI_CODE_BASE_URL: envBaseUrl,
        MIKI_CODE_OAUTH_HOST: envOauthHost,
      },
    });

    expect(auth.baseUrl).toBe('https://api.env.example.test/coding/v1');
    expect(auth.oauthRef).toEqual({
      storage: 'file',
      key: resolveMikiCodeOAuthKey({
        oauthHost: 'https://auth.env.example.test',
        baseUrl: 'https://api.env.example.test/coding/v1',
      }),
      oauthHost: 'https://auth.env.example.test',
    });
  });

  it('preserves a matching configured runtime OAuth ref when env is not overridden', () => {
    const baseUrl = 'https://api.dev.example.test/coding/v1';
    const configuredOAuthRef = {
      storage: 'keyring' as const,
      key: resolveMikiCodeOAuthKey({
        oauthHost: 'https://auth.dev.example.test',
        baseUrl,
      }),
      oauthHost: 'https://auth.dev.example.test',
    };

    expect(
      resolveMikiCodeRuntimeAuth({
        configuredBaseUrl: baseUrl,
        configuredOAuthRef,
        env: {},
      }),
    ).toEqual({
      baseUrl,
      oauthRef: configuredOAuthRef,
    });
  });

  it('resolves login auth without reusing persisted refs under explicit or env overrides', () => {
    const configuredBaseUrl = 'https://api.configured.example.test/coding/v1';
    const configuredOAuthRef = resolveMikiCodeOAuthRef({ baseUrl: configuredBaseUrl });

    expect(
      resolveMikiCodeLoginAuth({
        configuredBaseUrl,
        configuredOAuthRef,
        requestedBaseUrl: 'https://api.requested.example.test/coding/v1/',
        env: {},
      }),
    ).toEqual({
      baseUrl: 'https://api.requested.example.test/coding/v1',
      oauthHost: undefined,
    });

    expect(
      resolveMikiCodeLoginAuth({
        configuredBaseUrl,
        configuredOAuthRef,
        env: {},
      }),
    ).toEqual({
      baseUrl: configuredBaseUrl,
      oauthHost: undefined,
      oauthRef: configuredOAuthRef,
    });
  });

  it('writes the managed provider, models, services, and default model through an adapter', async () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        custom: {
          type: 'miki',
          apiKey: 'sk-existing',
          baseUrl: 'https://example.test/v1',
        },
      },
      models: {
        'miki-code/stale': {
          provider: MIKI_CODE_PROVIDER_NAME,
          model: 'stale',
        },
        'custom-default': {
          provider: 'custom',
          model: 'custom-model',
        },
      },
    };
    const write = vi.fn();
    const fetchMock = vi.fn(async () => makeModelsResponse());

    const result = await provisionManagedMikiCodeConfig({
      accessToken: 'oauth-access-token',
      fetchImpl: fetchMock as unknown as typeof fetch,
      adapter: {
        configPath: '/tmp/config.toml',
        read: () => config,
        write,
        apply: applyManagedMikiCodeConfig,
      },
    });

    expect(result).toMatchObject({
      providerName: MIKI_CODE_PROVIDER_NAME,
      defaultModel: 'miki-code/miki-for-coding',
      defaultThinking: true,
      configPath: '/tmp/config.toml',
    });
    expect(result.models[0]?.supportsToolUse).toBe(true);
    expect(result.models[1]?.supportsToolUse).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.miki.com/coding/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer oauth-access-token',
          Accept: 'application/json',
        }),
      }),
    );
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit?][];
    const init = calls[0]?.[1] ?? {};
    const headers = new Headers((init.headers ?? {}) as Record<string, string>);
    expect(headers.get('user-agent')).toBeNull();
    expect(headers.get('x-msh-platform')).toBeNull();
    expect(write).toHaveBeenCalledWith(config);

    expect(config.providers['custom']).toMatchObject({
      apiKey: 'sk-existing',
    });
    expect(config.models?.['custom-default']?.provider).toBe('custom');
    expect(config.models?.['miki-code/stale']).toBeUndefined();
    expect(config.providers[MIKI_CODE_PROVIDER_NAME]).toMatchObject({
      type: 'miki',
      baseUrl: 'https://api.miki.com/coding/v1',
      apiKey: '',
      oauth: { storage: 'file', key: 'oauth/miki-code' },
    });
    expect(config.models?.['miki-code/miki-for-coding']).toMatchObject({
      provider: MIKI_CODE_PROVIDER_NAME,
      model: 'miki-for-coding',
      maxContextSize: 262144,
      capabilities: ['thinking', 'image_in', 'video_in', 'tool_use'],
      displayName: 'Miki for Coding',
    });
    expect(config.models?.['miki-code/miki-k2.5']?.capabilities).toBeUndefined();
    expect(config.services?.mymoonSearch).toMatchObject({
      baseUrl: 'https://api.miki.com/coding/v1/search',
      apiKey: '',
      oauth: { storage: 'file', key: 'oauth/miki-code' },
    });
    expect(Object.keys(config.services ?? {})).toEqual(['mymoonSearch', 'mymoonFetch']);
  });

  it('writes scoped OAuth refs when provisioning against a non-default environment', async () => {
    const config: ManagedMikiConfigShape = {
      providers: {},
    };
    const oauthKey = resolveMikiCodeOAuthKey({
      oauthHost: 'https://auth.dev.example.test',
      baseUrl: 'https://api.dev.example.test/coding/v1',
    });

    await provisionManagedMikiCodeConfig({
      accessToken: 'oauth-access-token',
      baseUrl: 'https://api.dev.example.test/coding/v1',
      oauthKey,
      oauthHost: 'https://auth.dev.example.test',
      fetchImpl: vi.fn(async () => makeModelsResponse()) as unknown as typeof fetch,
      adapter: {
        read: () => config,
        write: vi.fn(),
        apply: applyManagedMikiCodeConfig,
      },
    });

    expect(config.providers[MIKI_CODE_PROVIDER_NAME]).toMatchObject({
      baseUrl: 'https://api.dev.example.test/coding/v1',
      oauth: {
        storage: 'file',
        key: oauthKey,
        oauthHost: 'https://auth.dev.example.test',
      },
    });
    expect(config.services?.mymoonSearch?.oauth).toEqual({
      storage: 'file',
      key: oauthKey,
      oauthHost: 'https://auth.dev.example.test',
    });
    expect(config.services?.mymoonFetch?.oauth).toEqual({
      storage: 'file',
      key: oauthKey,
      oauthHost: 'https://auth.dev.example.test',
    });
  });

  it('persists the default OAuth host when only the API base URL is scoped', async () => {
    const config: ManagedMikiConfigShape = {
      providers: {},
    };
    const baseUrl = 'https://api.example.test/coding/v1';
    const oauthKey = resolveMikiCodeOAuthKey({ baseUrl });

    await provisionManagedMikiCodeConfig({
      accessToken: 'oauth-access-token',
      baseUrl,
      fetchImpl: vi.fn(async () => makeModelsResponse()) as unknown as typeof fetch,
      adapter: {
        read: () => config,
        write: vi.fn(),
        apply: applyManagedMikiCodeConfig,
      },
    });

    expect(config.providers[MIKI_CODE_PROVIDER_NAME]).toMatchObject({
      baseUrl,
      oauth: {
        storage: 'file',
        key: oauthKey,
        oauthHost: 'https://auth.miki.com',
      },
    });
  });

  it('preserves an existing valid default model during refresh', async () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        custom: {
          type: 'miki',
          apiKey: 'sk-existing',
          baseUrl: 'https://example.test/v1',
        },
        [MIKI_CODE_PROVIDER_NAME]: {
          type: 'miki',
          apiKey: '',
        },
      },
      defaultModel: 'custom-default',
      thinking: { enabled: false },
      models: {
        'custom-default': {
          provider: 'custom',
          model: 'custom-model',
          maxContextSize: 1000,
        },
        'miki-code/stale': {
          provider: MIKI_CODE_PROVIDER_NAME,
          model: 'stale',
          maxContextSize: 1000,
        },
      },
    };

    const result = await provisionManagedMikiCodeConfig({
      accessToken: 'oauth-access-token',
      fetchImpl: vi.fn(async () => makeModelsResponse()) as unknown as typeof fetch,
      preserveDefaultModel: true,
      adapter: {
        read: () => config,
        write: vi.fn(),
        apply: applyManagedMikiCodeConfig,
      },
    });

    expect(result.defaultModel).toBe('custom-default');
    expect(result.defaultThinking).toBe(false);
    expect(config.defaultModel).toBe('custom-default');
    expect(config.thinking?.enabled).toBe(false);
    expect(config.models?.['miki-code/stale']).toBeUndefined();
    expect(config.models?.['miki-code/miki-for-coding']?.displayName).toBe('Miki for Coding');
  });

  it('infers default_thinking from fresh managed model capabilities', async () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        [MIKI_CODE_PROVIDER_NAME]: {
          type: 'miki',
          apiKey: '',
        },
      },
      defaultModel: 'miki-code/miki-for-coding',
      models: {
        'miki-code/miki-for-coding': {
          provider: MIKI_CODE_PROVIDER_NAME,
          model: 'miki-for-coding',
          maxContextSize: 1000,
          capabilities: [],
        },
      },
    };

    const result = await provisionManagedMikiCodeConfig({
      accessToken: 'oauth-access-token',
      fetchImpl: vi.fn(async () => makeModelsResponse()) as unknown as typeof fetch,
      preserveDefaultModel: true,
      adapter: {
        read: () => config,
        write: vi.fn(),
        apply: applyManagedMikiCodeConfig,
      },
    });

    expect(result.defaultModel).toBe('miki-code/miki-for-coding');
    expect(result.defaultThinking).toBe(true);
    expect(config.thinking?.enabled).toBe(true);
  });

  it('preserves explicit default_thinking when preserving a custom default without capabilities', async () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        custom: {
          type: 'miki',
          apiKey: 'sk-existing',
        },
      },
      defaultModel: 'custom-default',
      thinking: { enabled: true },
      models: {
        'custom-default': {
          provider: 'custom',
          model: 'custom-model',
          maxContextSize: 1000,
        },
      },
    };

    const result = await provisionManagedMikiCodeConfig({
      accessToken: 'oauth-access-token',
      fetchImpl: vi.fn(async () => makeModelsResponse()) as unknown as typeof fetch,
      preserveDefaultModel: true,
      adapter: {
        read: () => config,
        write: vi.fn(),
        apply: applyManagedMikiCodeConfig,
      },
    });

    expect(result.defaultModel).toBe('custom-default');
    expect(result.defaultThinking).toBe(true);
    expect(config.thinking?.enabled).toBe(true);
  });

  it('defaults default_thinking to false when a preserved custom default has no signal', async () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        custom: {
          type: 'miki',
          apiKey: 'sk-existing',
        },
      },
      defaultModel: 'custom-default',
      models: {
        'custom-default': {
          provider: 'custom',
          model: 'custom-model',
          maxContextSize: 1000,
        },
      },
    };

    const result = await provisionManagedMikiCodeConfig({
      accessToken: 'oauth-access-token',
      fetchImpl: vi.fn(async () => makeModelsResponse()) as unknown as typeof fetch,
      preserveDefaultModel: true,
      adapter: {
        read: () => config,
        write: vi.fn(),
        apply: applyManagedMikiCodeConfig,
      },
    });

    expect(result.defaultModel).toBe('custom-default');
    expect(result.defaultThinking).toBe(false);
    expect(config.thinking?.enabled).toBe(false);
  });

  it('does not infer default_thinking from preserved custom default capabilities', async () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        custom: {
          type: 'miki',
          apiKey: 'sk-existing',
        },
      },
      defaultModel: 'custom-default',
      models: {
        'custom-default': {
          provider: 'custom',
          model: 'custom-model',
          maxContextSize: 1000,
          capabilities: [],
        },
      },
    };

    const result = await provisionManagedMikiCodeConfig({
      accessToken: 'oauth-access-token',
      fetchImpl: vi.fn(async () => makeModelsResponse()) as unknown as typeof fetch,
      preserveDefaultModel: true,
      adapter: {
        read: () => config,
        write: vi.fn(),
        apply: applyManagedMikiCodeConfig,
      },
    });

    expect(result.defaultModel).toBe('custom-default');
    expect(result.defaultThinking).toBe(false);
    expect(config.thinking?.enabled).toBe(false);
  });

  it('keeps default_thinking off even when preserved custom default has thinking capability', async () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        custom: {
          type: 'miki',
          apiKey: 'sk-existing',
        },
      },
      defaultModel: 'custom-default',
      models: {
        'custom-default': {
          provider: 'custom',
          model: 'custom-model',
          maxContextSize: 1000,
          capabilities: ['thinking'],
        },
      },
    };

    const result = await provisionManagedMikiCodeConfig({
      accessToken: 'oauth-access-token',
      fetchImpl: vi.fn(async () => makeModelsResponse()) as unknown as typeof fetch,
      preserveDefaultModel: true,
      adapter: {
        read: () => config,
        write: vi.fn(),
        apply: applyManagedMikiCodeConfig,
      },
    });

    expect(result.defaultModel).toBe('custom-default');
    expect(result.defaultThinking).toBe(false);
    expect(config.thinking?.enabled).toBe(false);
  });

  it('falls back to the first fetched model when the preserved default was removed', async () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        [MIKI_CODE_PROVIDER_NAME]: {
          type: 'miki',
          apiKey: '',
        },
      },
      defaultModel: 'miki-code/stale',
      thinking: { enabled: false },
      models: {
        'miki-code/stale': {
          provider: MIKI_CODE_PROVIDER_NAME,
          model: 'stale',
          maxContextSize: 1000,
        },
      },
    };

    const result = await provisionManagedMikiCodeConfig({
      accessToken: 'oauth-access-token',
      fetchImpl: vi.fn(async () => makeModelsResponse()) as unknown as typeof fetch,
      preserveDefaultModel: true,
      adapter: {
        read: () => config,
        write: vi.fn(),
        apply: applyManagedMikiCodeConfig,
      },
    });

    expect(result.defaultModel).toBe('miki-code/miki-for-coding');
    expect(result.defaultThinking).toBe(false);
    expect(config.defaultModel).toBe('miki-code/miki-for-coding');
    expect(config.thinking?.enabled).toBe(false);
  });

  it('removes managed provider, models, services, and default model on logout', () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        [MIKI_CODE_PROVIDER_NAME]: {
          type: 'miki',
          apiKey: '',
        },
        custom: {
          type: 'miki',
          apiKey: 'sk-existing',
        },
      },
      defaultModel: 'miki-code/miki-for-coding',
      thinking: { enabled: true },
      models: {
        'miki-code/miki-for-coding': {
          provider: MIKI_CODE_PROVIDER_NAME,
          model: 'miki-for-coding',
          maxContextSize: 262144,
        },
        'custom-default': {
          provider: 'custom',
          model: 'custom-model',
          maxContextSize: 1000,
        },
      },
      services: {
        mymoonSearch: { baseUrl: 'https://api.miki.com/coding/v1/search' },
        mymoonFetch: { baseUrl: 'https://api.miki.com/coding/v1/fetch' },
        customService: { baseUrl: 'https://service.example.test' },
      },
      raw: {
        default_model: 'miki-code/miki-for-coding',
        providers: {
          [MIKI_CODE_PROVIDER_NAME]: { type: 'miki' },
          custom: { type: 'miki' },
        },
        models: {
          'miki-code/miki-for-coding': {
            provider: MIKI_CODE_PROVIDER_NAME,
            model: 'miki-for-coding',
          },
          'custom-default': {
            provider: 'custom',
            model: 'custom-model',
          },
        },
        services: {
          mymoon_search: { base_url: 'https://api.miki.com/coding/v1/search' },
          mymoon_fetch: { base_url: 'https://api.miki.com/coding/v1/fetch' },
        },
      },
    };

    applyManagedMikiCodeLogoutConfig(config);

    expect(config.defaultModel).toBeUndefined();
    expect(config.providers[MIKI_CODE_PROVIDER_NAME]).toBeUndefined();
    expect(config.providers['custom']).toBeDefined();
    expect(config.models?.['miki-code/miki-for-coding']).toBeUndefined();
    expect(config.models?.['custom-default']).toBeDefined();
    expect(config.services?.mymoonSearch).toBeUndefined();
    expect(config.services?.mymoonFetch).toBeUndefined();
    expect(config.services?.['customService']).toEqual({
      baseUrl: 'https://service.example.test',
    });
  });

  it('rejects managed models that do not include a positive limit.context', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'miki-for-coding', reasoning: { type: 'only' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    ) as unknown as typeof fetch;

    await expect(
      fetchManagedMikiCodeModels({
        accessToken: 'oauth-access-token',
        fetchImpl,
      }),
    ).rejects.toThrow(/positive limit\.context/);
  });

  it('surfaces API error messages from model listing failures', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch;

    await expect(
      fetchManagedMikiCodeModels({
        accessToken: 'oauth-access-token',
        fetchImpl,
      }),
    ).rejects.toThrow('quota exceeded');
  });

  it('classifies model listing 401 responses as OAuth unauthorized', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { message: 'The API Key appears to be invalid or may have expired.' },
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    ) as unknown as typeof fetch;

    await expect(
      fetchManagedMikiCodeModels({
        accessToken: 'oauth-access-token',
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(OAuthUnauthorizedError);
  });

  it('classifies membership-check 402 responses as OAuth unauthorized', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message:
                "We're unable to verify your membership benefits at this time. Please ensure your membership is active.",
            },
          }),
          {
            status: 402,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    ) as unknown as typeof fetch;

    const promise = fetchManagedMikiCodeModels({
      accessToken: 'oauth-access-token',
      baseUrl: 'https://api.dev.example.test/coding/v1',
      fetchImpl,
    });

    await expect(promise).rejects.toThrow(
      "Miki Code models endpoint https://api.dev.example.test/coding/v1 rejected OAuth credentials: We're unable to verify your membership benefits at this time. Please ensure your membership is active.",
    );
    await expect(
      fetchManagedMikiCodeModels({
        accessToken: 'oauth-access-token',
        baseUrl: 'https://api.dev.example.test/coding/v1',
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      status: 402,
      baseUrl: 'https://api.dev.example.test/coding/v1',
    });
    await expect(
      fetchManagedMikiCodeModels({
        accessToken: 'oauth-access-token',
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(OAuthUnauthorizedError);
    await expect(
      fetchManagedMikiCodeModels({
        accessToken: 'oauth-access-token',
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(ManagedMikiCodeModelsAuthError);
  });

  it('clears managed provider, models, default model, and services on logout', () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        [MIKI_CODE_PROVIDER_NAME]: {
          type: 'miki',
          apiKey: '',
          oauth: { storage: 'file', key: 'oauth/miki-code' },
        },
        custom: {
          type: 'miki',
          apiKey: 'sk-existing',
        },
      },
      defaultModel: 'miki-code/miki-for-coding',
      models: {
        'miki-code/miki-for-coding': {
          provider: MIKI_CODE_PROVIDER_NAME,
          model: 'miki-for-coding',
          maxContextSize: 262144,
        },
        'custom-default': {
          provider: 'custom',
          model: 'custom-model',
          maxContextSize: 128000,
        },
      },
      services: {
        mymoonSearch: {
          baseUrl: 'https://api.miki.com/coding/v1/search',
          apiKey: '',
          oauth: { storage: 'file', key: 'oauth/miki-code' },
        },
        mymoonFetch: {
          baseUrl: 'https://api.miki.com/coding/v1/fetch',
          apiKey: '',
          oauth: { storage: 'file', key: 'oauth/miki-code' },
        },
        otherService: { baseUrl: 'https://service.example.test' },
      },
    };

    const result = clearManagedMikiCodeConfig(config);

    expect(result).toMatchObject({
      providerName: MIKI_CODE_PROVIDER_NAME,
      removedProvider: true,
      removedModels: ['miki-code/miki-for-coding'],
      defaultModelCleared: true,
      removedServices: ['mymoonSearch', 'mymoonFetch'],
    });
    expect(config.providers[MIKI_CODE_PROVIDER_NAME]).toBeUndefined();
    expect(config.providers['custom']).toMatchObject({ apiKey: 'sk-existing' });
    expect(config.defaultModel).toBeUndefined();
    expect(config.models?.['miki-code/miki-for-coding']).toBeUndefined();
    expect(config.models?.['custom-default']).toMatchObject({ provider: 'custom' });
    expect(config.services?.mymoonSearch).toBeUndefined();
    expect(config.services?.mymoonFetch).toBeUndefined();
    expect(config.services?.['otherService']).toMatchObject({
      baseUrl: 'https://service.example.test',
    });
  });
});

describe('reasoning', () => {
  function makeReasoningModelsResponse(): Response {
    return new Response(
      JSON.stringify({
        data: [
          {
            id: 'miki-for-coding',
            limit: { context: 262144 },
            modalities: { input: ['text', 'image', 'video'], output: ['text'] },
            reasoning: { type: 'only' },
            tools: { dynamic_load: true },
            display_name: 'Miki For Coding',
          },
          {
            id: 'miki-plain',
            limit: { context: 128000 },
            reasoning: { type: 'none' },
          },
          {
            id: 'miki-toggle',
            limit: { context: 128000 },
            reasoning: { type: 'both' },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  it('parses reasoning.type and tools.dynamic_load from the models endpoint', async () => {
    const models = await fetchManagedMikiCodeModels({
      accessToken: 'oauth-access-token',
      fetchImpl: vi.fn(async () => makeReasoningModelsResponse()) as unknown as typeof fetch,
    });

    expect(models[0]?.supportsThinkingType).toBe('only');
    expect(models[0]?.supportsReasoning).toBe(true);
    expect(models[1]?.supportsThinkingType).toBe('no');
    expect(models[1]?.supportsReasoning).toBe(false);
    expect(models[2]?.supportsThinkingType).toBe('both');
    expect(models[0]?.supportsDynamicTools).toBe(true);
    expect(models[1]?.supportsDynamicTools).toBe(false);
  });

  it('maps absent reasoning to no and leaves unknown reasoning types undefined', async () => {
    const absent = await fetchManagedMikiCodeModels({
      accessToken: 'oauth-access-token',
      fetchImpl: vi.fn(async () => makeModelsResponse()) as unknown as typeof fetch,
    });
    expect(absent[1]?.supportsThinkingType).toBe('no');
    expect(absent[1]?.supportsReasoning).toBe(false);

    const invalid = await fetchManagedMikiCodeModels({
      accessToken: 'oauth-access-token',
      fetchImpl: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  id: 'miki-for-coding',
                  limit: { context: 262144 },
                  reasoning: { type: 'maybe' },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ) as unknown as typeof fetch,
    });
    expect(invalid[0]?.supportsThinkingType).toBeUndefined();
  });

  it('maps the three states onto capabilities', async () => {
    const config: ManagedMikiConfigShape = { providers: {} };

    await provisionManagedMikiCodeConfig({
      accessToken: 'oauth-access-token',
      fetchImpl: vi.fn(async () => makeReasoningModelsResponse()) as unknown as typeof fetch,
      adapter: {
        read: () => config,
        write: vi.fn(),
        apply: applyManagedMikiCodeConfig,
      },
    });

    // 'only' → thinking locked on; tools.dynamic_load adds dynamically_loaded_tools.
    expect(config.models?.['miki-code/miki-for-coding']?.capabilities).toEqual([
      'thinking',
      'always_thinking',
      'image_in',
      'video_in',
      'tool_use',
      'dynamically_loaded_tools',
    ]);
    // 'none' → no thinking capability.
    expect(config.models?.['miki-code/miki-plain']?.capabilities).toEqual(['tool_use']);
    // 'both' → plain toggleable thinking.
    expect(config.models?.['miki-code/miki-toggle']?.capabilities).toEqual([
      'thinking',
      'tool_use',
    ]);
  });

  it('forces default thinking on when the selected default model is thinking-only', async () => {
    const config: ManagedMikiConfigShape = { providers: {}, thinking: { enabled: false } };

    const result = await provisionManagedMikiCodeConfig({
      accessToken: 'oauth-access-token',
      fetchImpl: vi.fn(async () => makeReasoningModelsResponse()) as unknown as typeof fetch,
      adapter: {
        read: () => config,
        write: vi.fn(),
        apply: applyManagedMikiCodeConfig,
      },
    });

    expect(result.defaultModel).toBe('miki-code/miki-for-coding');
    expect(result.defaultThinking).toBe(true);
    expect(config.thinking?.enabled).toBe(true);
  });

  it('forces default thinking on when preserving a thinking-only managed default', async () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        [MIKI_CODE_PROVIDER_NAME]: {
          type: 'miki',
          apiKey: '',
        },
      },
      defaultModel: 'miki-code/miki-for-coding',
      thinking: { enabled: false },
      models: {
        'miki-code/miki-for-coding': {
          provider: MIKI_CODE_PROVIDER_NAME,
          model: 'miki-for-coding',
          maxContextSize: 262144,
          capabilities: ['thinking'],
        },
      },
    };

    const result = await provisionManagedMikiCodeConfig({
      accessToken: 'oauth-access-token',
      fetchImpl: vi.fn(async () => makeReasoningModelsResponse()) as unknown as typeof fetch,
      preserveDefaultModel: true,
      adapter: {
        read: () => config,
        write: vi.fn(),
        apply: applyManagedMikiCodeConfig,
      },
    });

    expect(result.defaultModel).toBe('miki-code/miki-for-coding');
    expect(result.defaultThinking).toBe(true);
    expect(config.thinking?.enabled).toBe(true);
  });

  it('forces default thinking off when preserving a no-thinking managed default', async () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        [MIKI_CODE_PROVIDER_NAME]: {
          type: 'miki',
          apiKey: '',
        },
      },
      defaultModel: 'miki-code/miki-plain',
      thinking: { enabled: true },
      models: {
        'miki-code/miki-plain': {
          provider: MIKI_CODE_PROVIDER_NAME,
          model: 'miki-plain',
          maxContextSize: 128000,
          capabilities: ['thinking'],
        },
      },
    };

    const result = await provisionManagedMikiCodeConfig({
      accessToken: 'oauth-access-token',
      fetchImpl: vi.fn(async () => makeReasoningModelsResponse()) as unknown as typeof fetch,
      preserveDefaultModel: true,
      adapter: {
        read: () => config,
        write: vi.fn(),
        apply: applyManagedMikiCodeConfig,
      },
    });

    expect(result.defaultModel).toBe('miki-code/miki-plain');
    expect(result.defaultThinking).toBe(false);
    expect(config.thinking?.enabled).toBe(false);
  });

  it('forces default thinking off when the preserved default omits reasoning', async () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        [MIKI_CODE_PROVIDER_NAME]: {
          type: 'miki',
          apiKey: '',
        },
      },
      defaultModel: 'miki-code/miki-k2.5',
      thinking: { enabled: true },
      models: {
        'miki-code/miki-k2.5': {
          provider: MIKI_CODE_PROVIDER_NAME,
          model: 'miki-k2.5',
          maxContextSize: 250000,
          capabilities: ['thinking'],
        },
      },
    };

    const result = await provisionManagedMikiCodeConfig({
      accessToken: 'oauth-access-token',
      fetchImpl: vi.fn(async () => makeModelsResponse()) as unknown as typeof fetch,
      preserveDefaultModel: true,
      adapter: {
        read: () => config,
        write: vi.fn(),
        apply: applyManagedMikiCodeConfig,
      },
    });

    // miki-k2.5 has no reasoning object in the response — the stale
    // thinking.enabled must not survive the refresh.
    expect(result.defaultModel).toBe('miki-code/miki-k2.5');
    expect(result.defaultThinking).toBe(false);
    expect(config.thinking?.enabled).toBe(false);
  });

  it('keeps a preserved non-managed default thinking selection untouched', async () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        custom: {
          type: 'miki',
          apiKey: 'sk-existing',
        },
      },
      defaultModel: 'custom-default',
      thinking: { enabled: false },
      models: {
        'custom-default': {
          provider: 'custom',
          model: 'custom-model',
          maxContextSize: 1000,
        },
      },
    };

    const result = await provisionManagedMikiCodeConfig({
      accessToken: 'oauth-access-token',
      fetchImpl: vi.fn(async () => makeReasoningModelsResponse()) as unknown as typeof fetch,
      preserveDefaultModel: true,
      adapter: {
        read: () => config,
        write: vi.fn(),
        apply: applyManagedMikiCodeConfig,
      },
    });

    expect(result.defaultModel).toBe('custom-default');
    expect(result.defaultThinking).toBe(false);
    expect(config.thinking?.enabled).toBe(false);
  });
});

describe('reasoning.effort', () => {
  function makeEffortModelsResponse(): Response {
    return new Response(
      JSON.stringify({
        data: [
          {
            id: 'miki-for-coding',
            limit: { context: 262144 },
            reasoning: {
              type: 'both',
              effort: { valid: ['low', 'high', 'max'], default: 'high' },
            },
            display_name: 'Miki For Coding',
          },
          {
            // Empty / non-string entries are filtered; absent fields stay undefined.
            id: 'miki-plain',
            limit: { context: 128000 },
            reasoning: { type: 'only', effort: { valid: ['low', '', 42] } },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  it('parses reasoning.effort from the models endpoint', async () => {
    const models = await fetchManagedMikiCodeModels({
      accessToken: 'oauth-access-token',
      fetchImpl: vi.fn(async () => makeEffortModelsResponse()) as unknown as typeof fetch,
    });

    expect(models[0]?.supportEfforts).toEqual(['low', 'high', 'max']);
    expect(models[0]?.defaultEffort).toBe('high');
    // The empty string and number are filtered out of effort.valid.
    expect(models[1]?.supportEfforts).toEqual(['low']);
    expect(models[1]?.defaultEffort).toBeUndefined();
  });

  it('drops effort.default when it is not listed in effort.valid', async () => {
    const models = await fetchManagedMikiCodeModels({
      accessToken: 'oauth-access-token',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'miki-bad-default',
                limit: { context: 128000 },
                reasoning: {
                  type: 'only',
                  effort: { valid: ['low', 'high'], default: 'max' },
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    expect(models[0]?.supportEfforts).toEqual(['low', 'high']);
    expect(models[0]?.defaultEffort).toBeUndefined();
  });

  it('ignores legacy effort fields even when reasoning.effort is absent', async () => {
    // The legacy think_efforts / support_efforts / default_effort fields are no
    // longer read; only the nested reasoning.effort object is honored.
    const models = await fetchManagedMikiCodeModels({
      accessToken: 'oauth-access-token',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'miki-k2',
                limit: { context: 128000 },
                reasoning: { type: 'both' },
                think_efforts: {
                  support: true,
                  valid_efforts: ['low', 'high'],
                  default_effort: 'high',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    expect(models[0]?.supportEfforts).toBeUndefined();
    expect(models[0]?.defaultEffort).toBeUndefined();
  });

  it('writes supportEfforts and defaultEffort onto the provisioned model entry', async () => {
    const config: ManagedMikiConfigShape = { providers: {} };

    await provisionManagedMikiCodeConfig({
      accessToken: 'oauth-access-token',
      fetchImpl: vi.fn(async () => makeEffortModelsResponse()) as unknown as typeof fetch,
      adapter: {
        read: () => config,
        write: vi.fn(),
        apply: applyManagedMikiCodeConfig,
      },
    });

    const alias = config.models?.['miki-code/miki-for-coding'];
    expect(alias?.['supportEfforts']).toEqual(['low', 'high', 'max']);
    expect(alias?.['defaultEffort']).toBe('high');
  });
});

describe('selective merge', () => {
  const baseOptions = {
    baseUrl: 'https://api.example.test/coding/v1',
    oauthKey: 'test-key',
  };

  it('preserves non-managed user fields but drops stale managed fields', () => {
    const config: ManagedMikiConfigShape = {
      providers: {},
      models: {
        'miki-code/miki-k2': {
          provider: 'miki-code',
          model: 'miki-k2',
          maxContextSize: 262144,
          capabilities: ['thinking'],
          maxOutputSize: 4096,
          supportEfforts: ['low', 'high', 'max'],
        } as Record<string, unknown>,
      },
    };

    applyManagedMikiCodeConfig(config, {
      ...baseOptions,
      models: [
        {
          id: 'miki-k2',
          contextLength: 262144,
          supportsReasoning: true,
          supportsImageIn: false,
          supportsVideoIn: false,
          supportsThinkingType: 'both',
        },
      ],
    });

    const alias = config.models?.['miki-code/miki-k2'];
    expect(alias?.['maxOutputSize']).toBe(4096);
    expect(alias?.['supportEfforts']).toBeUndefined();
    expect(alias?.['maxContextSize']).toBe(262144);
  });

  it('preserves overrides when upstream declares managed fields', () => {
    const config: ManagedMikiConfigShape = {
      providers: {},
      models: {
        'miki-code/miki-k2': {
          provider: 'miki-code',
          model: 'miki-k2',
          maxContextSize: 262144,
          overrides: { supportEfforts: ['low'] },
        } as Record<string, unknown>,
      },
    };

    applyManagedMikiCodeConfig(config, {
      ...baseOptions,
      models: [
        {
          id: 'miki-k2',
          contextLength: 262144,
          supportsReasoning: true,
          supportsImageIn: false,
          supportsVideoIn: false,
          supportEfforts: ['low', 'high', 'max'],
          defaultEffort: 'high',
        },
      ],
    });

    const alias = config.models?.['miki-code/miki-k2'];
    expect(alias?.['supportEfforts']).toEqual(['low', 'high', 'max']);
    expect(alias?.['defaultEffort']).toBe('high');
    expect(alias?.['overrides']).toEqual({ supportEfforts: ['low'] });
  });

  it('removes managed models that upstream no longer lists', () => {
    const config: ManagedMikiConfigShape = {
      providers: {},
      models: {
        'miki-code/miki-k2': {
          provider: MIKI_CODE_PROVIDER_NAME,
          model: 'miki-k2',
          maxContextSize: 262144,
        },
        'miki-code/removed': {
          provider: MIKI_CODE_PROVIDER_NAME,
          model: 'removed',
          maxContextSize: 128000,
        },
      },
    };

    applyManagedMikiCodeConfig(config, {
      ...baseOptions,
      models: [
        {
          id: 'miki-k2',
          contextLength: 262144,
          supportsReasoning: true,
          supportsImageIn: false,
          supportsVideoIn: false,
        },
      ],
    });

    expect(config.models?.['miki-code/miki-k2']).toBeDefined();
    expect(config.models?.['miki-code/removed']).toBeUndefined();
  });
});

describe('applyManagedApiKeyProviderModels', () => {
  it('merges upstream models without touching provider, services, or defaults', () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        'my-miki': {
          type: 'miki',
          baseUrl: 'https://api.example.test/coding/v1',
          apiKey: 'sk-distributed-key',
        },
      },
      models: {
        'my-miki/miki-k2': {
          provider: 'my-miki',
          model: 'miki-k2',
          maxContextSize: 262144,
          displayName: 'Old K2',
          maxOutputSize: 4096,
        } as Record<string, unknown>,
        'my-miki/miki-old': {
          provider: 'my-miki',
          model: 'miki-old',
          maxContextSize: 128000,
        },
        'other/m1': {
          provider: 'other',
          model: 'm1',
          maxContextSize: 128000,
        },
      },
      defaultModel: 'my-miki/miki-k2',
      thinking: { enabled: false },
    };

    applyManagedApiKeyProviderModels(
      config,
      'my-miki',
      [makeModelInfo('miki-k2', { displayName: 'Fresh K2' }), makeModelInfo('miki-k2.5')],
      'my-miki/',
    );

    // The provider record is user-owned: no rewrite, no oauth, no apiKey reset.
    expect(config.providers['my-miki']).toEqual({
      type: 'miki',
      baseUrl: 'https://api.example.test/coding/v1',
      apiKey: 'sk-distributed-key',
    });
    // Defaults and services are the orchestrator's / OAuth branch's business.
    expect(config.defaultModel).toBe('my-miki/miki-k2');
    expect(config.thinking).toEqual({ enabled: false });
    expect(config.services).toBeUndefined();
    // Upstream-owned fields merge; hand-written extras survive.
    const alias = config.models?.['my-miki/miki-k2'];
    expect(alias?.['displayName']).toBe('Fresh K2');
    expect(alias?.['maxOutputSize']).toBe(4096);
    // New upstream model added; dropped one removed; other providers untouched.
    expect(config.models?.['my-miki/miki-k2.5']).toBeDefined();
    expect(config.models?.['my-miki/miki-old']).toBeUndefined();
    expect(config.models?.['other/m1']).toBeDefined();
  });

  it('writes protocol routing fields for anthropic-protocol models', () => {
    const config: ManagedMikiConfigShape = { providers: {}, models: {} };

    applyManagedApiKeyProviderModels(
      config,
      'my-miki',
      [makeModelInfo('miki-for-coding', { protocol: 'anthropic', supportsReasoning: true })],
      'my-miki/',
    );

    const alias = config.models?.['my-miki/miki-for-coding'];
    expect(alias?.['provider']).toBe('my-miki');
    expect(alias?.['protocol']).toBe('anthropic');
    expect(alias?.['betaApi']).toBe(true);
    expect(alias?.['adaptiveThinking']).toBe(true);
    expect(alias?.['capabilities']).toEqual(['thinking', 'tool_use']);
  });

  it('rejects models without a positive context length', () => {
    const config: ManagedMikiConfigShape = { providers: {}, models: {} };

    expect(() => {
      applyManagedApiKeyProviderModels(
        config,
        'my-miki',
        [makeModelInfo('bad', { contextLength: 0 })],
        'my-miki/',
      );
    }).toThrow('limit.context');
  });
});

function makeModelInfo(
  id: string,
  overrides: Partial<ManagedMikiCodeModelInfo> = {},
): ManagedMikiCodeModelInfo {
  return {
    id,
    contextLength: 200000,
    supportsReasoning: false,
    supportsImageIn: false,
    supportsVideoIn: false,
    ...overrides,
  };
}

const MIKI_BASE_URL = 'https://api.miki.com/coding/v1';

describe('managed protocol routing', () => {
  it('reads protocol from the /models response', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'miki-for-coding', limit: { context: 262144 }, protocol: 'anthropic' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    ) as unknown as typeof fetch;

    const models = await fetchManagedMikiCodeModels({ accessToken: 't', fetchImpl });
    expect(models).toHaveLength(1);
    expect(models[0]?.protocol).toBe('anthropic');
  });

  it('maps the server "response" protocol value to openai_responses', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'k3', limit: { context: 1048576 }, protocol: 'response' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    ) as unknown as typeof fetch;

    const models = await fetchManagedMikiCodeModels({ accessToken: 't', fetchImpl });
    expect(models).toHaveLength(1);
    expect(models[0]?.protocol).toBe('openai_responses');
  });

  it('records openai_responses protocol without anthropic routing fields', () => {
    const config: ManagedMikiConfigShape = { providers: {} };
    applyManagedMikiCodeConfig(config, {
      baseUrl: MIKI_BASE_URL,
      models: [makeModelInfo('k3', { protocol: 'openai_responses', supportsReasoning: true })],
    });

    expect(config.providers[MIKI_CODE_PROVIDER_NAME]).toMatchObject({
      type: 'miki',
      baseUrl: MIKI_BASE_URL,
      apiKey: '',
    });
    const alias = config.models?.['miki-code/k3'];
    expect(alias?.protocol).toBe('openai_responses');
    expect(alias?.betaApi).toBeUndefined();
    expect(alias?.adaptiveThinking).toBeUndefined();
  });

  it('keeps the provider on the miki REST base and records the model protocol when anthropic', () => {
    const config: ManagedMikiConfigShape = { providers: {} };
    applyManagedMikiCodeConfig(config, {
      baseUrl: MIKI_BASE_URL,
      models: [makeModelInfo('miki-for-coding', { protocol: 'anthropic' })],
    });

    // The provider stays on the miki wire + REST base; the anthropic transport
    // is resolved per-model at runtime, not baked into the provider config, so
    // the REST base keeps flowing to OAuth key derivation and plugin env.
    expect(config.providers[MIKI_CODE_PROVIDER_NAME]).toMatchObject({
      type: 'miki',
      baseUrl: MIKI_BASE_URL,
      apiKey: '',
    });
    expect(config.models?.['miki-code/miki-for-coding']).toMatchObject({
      provider: MIKI_CODE_PROVIDER_NAME,
      protocol: 'anthropic',
      betaApi: true,
    });
  });

  it('keeps the miki protocol and baseUrl when the model has no anthropic protocol', () => {
    const config: ManagedMikiConfigShape = { providers: {} };
    applyManagedMikiCodeConfig(config, {
      baseUrl: MIKI_BASE_URL,
      models: [makeModelInfo('miki-for-coding')],
    });

    expect(config.providers[MIKI_CODE_PROVIDER_NAME]).toMatchObject({
      type: 'miki',
      baseUrl: MIKI_BASE_URL,
      apiKey: '',
    });
    expect(config.models?.['miki-code/miki-for-coding']?.provider).toBe(MIKI_CODE_PROVIDER_NAME);
    expect(config.models?.['miki-code/miki-for-coding']?.protocol).toBeUndefined();
  });

  it('drops the model protocol on refresh when the server stops declaring anthropic', () => {
    const config: ManagedMikiConfigShape = { providers: {} };
    applyManagedMikiCodeConfig(config, {
      baseUrl: MIKI_BASE_URL,
      models: [makeModelInfo('miki-for-coding', { protocol: 'anthropic' })],
    });
    expect(config.models?.['miki-code/miki-for-coding']?.protocol).toBe('anthropic');

    applyManagedMikiCodeConfig(config, {
      baseUrl: MIKI_BASE_URL,
      models: [makeModelInfo('miki-for-coding')],
    });
    // The provider never leaves the miki wire / REST base across refreshes —
    // only the per-model protocol annotation changes.
    expect(config.providers[MIKI_CODE_PROVIDER_NAME]).toMatchObject({
      type: 'miki',
      baseUrl: MIKI_BASE_URL,
    });
    expect(config.models?.['miki-code/miki-for-coding']?.protocol).toBeUndefined();
  });
});
