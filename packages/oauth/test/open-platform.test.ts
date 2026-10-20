import { describe, expect, it, vi } from 'vitest';

import {
  applyOpenPlatformConfig,
  capabilitiesForModel,
  fetchOpenPlatformModels,
  filterModelsByPrefix,
  getOpenPlatformById,
  isOpenPlatformId,
  OPEN_PLATFORMS,
  OpenPlatformApiError,
  removeOpenPlatformConfig,
  type ManagedMikiConfigShape,
} from '../src/open-platform';

function makeModelsResponse(): Response {
  return new Response(
    JSON.stringify({
      data: [
        {
          id: 'miki-k2-0712-preview',
          context_length: 256000,
          supports_reasoning: true,
          supports_image_in: true,
          supports_video_in: true,
          display_name: 'Miki K2 0712 Preview',
        },
        {
          id: 'miki-k2-lite',
          context_length: 128000,
          supports_reasoning: false,
          supports_image_in: false,
          supports_video_in: false,
          supports_tool_use: false,
        },
        {
          id: 'non-miki-model',
          context_length: 1000,
          supports_reasoning: false,
        },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('OPEN_PLATFORMS', () => {
  it('contains mymoon.cn and mymoon.ai', () => {
    expect(getOpenPlatformById('mymoon-cn')).toMatchObject({
      name: 'Miki Platform (API key · platform.miki.com)',
      baseUrl: 'https://api.mymoon.cn/v1',
      consoleUrl: 'https://platform.miki.com',
      allowedPrefixes: ['miki-k'],
    });
    expect(getOpenPlatformById('mymoon-ai')).toMatchObject({
      name: 'Miki Platform (API key · platform.miki.ai)',
      baseUrl: 'https://api.mymoon.ai/v1',
      consoleUrl: 'https://platform.miki.ai',
      allowedPrefixes: ['miki-k'],
    });
    expect(getOpenPlatformById('unknown')).toBeUndefined();
  });

  it('isOpenPlatformId works', () => {
    expect(isOpenPlatformId('mymoon-cn')).toBe(true);
    expect(isOpenPlatformId('mymoon-ai')).toBe(true);
    expect(isOpenPlatformId('miki-code')).toBe(false);
  });
});

describe('fetchOpenPlatformModels', () => {
  it('lists and parses models from the platform endpoint', async () => {
    const fetchMock = vi.fn(async () => makeModelsResponse());
    const platform = getOpenPlatformById('mymoon-cn')!;

    const models = await fetchOpenPlatformModels(platform, 'sk-test', fetchMock as unknown as typeof fetch);

    expect(models).toHaveLength(3);
    expect(models[0]).toMatchObject({
      id: 'miki-k2-0712-preview',
      contextLength: 256000,
      supportsReasoning: true,
      supportsImageIn: true,
      supportsVideoIn: true,
      displayName: 'Miki K2 0712 Preview',
    });
    expect(models[1]?.supportsToolUse).toBe(false);
    expect(models[2]?.id).toBe('non-miki-model');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.mymoon.cn/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          Accept: 'application/json',
        }),
      }),
    );
  });

  it('surfaces API error messages and status on HTTP error', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'invalid API key' } }), { status: 401 }),
    );
    const platform = getOpenPlatformById('mymoon-cn')!;

    const error = await fetchOpenPlatformModels(
      platform,
      'sk-bad',
      fetchMock as unknown as typeof fetch,
    ).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(OpenPlatformApiError);
    expect((error as OpenPlatformApiError).status).toBe(401);
    expect((error as Error).message).toBe('invalid API key');
  });

  it('throws on unexpected response shape', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    const platform = getOpenPlatformById('mymoon-cn')!;

    await expect(
      fetchOpenPlatformModels(platform, 'sk-test', fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/Unexpected models response/);
  });
});

describe('filterModelsByPrefix', () => {
  it('filters by allowedPrefixes when present', () => {
    const platform = getOpenPlatformById('mymoon-cn')!;
    const models = [
      { id: 'miki-k2-0712-preview', contextLength: 256000, supportsReasoning: true, supportsImageIn: true, supportsVideoIn: true },
      { id: 'gpt-4', contextLength: 1000, supportsReasoning: false, supportsImageIn: false, supportsVideoIn: false },
    ];

    const filtered = filterModelsByPrefix(models as unknown as import('../src/managed-miki-code').ManagedMikiCodeModelInfo[], platform);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('miki-k2-0712-preview');
  });

  it('returns all models when allowedPrefixes is absent', () => {
    const platform: import('../src/open-platform').OpenPlatformDefinition = {
      id: 'custom',
      name: 'Custom',
      baseUrl: 'https://example.com/v1',
    };
    const models = [
      { id: 'model-a', contextLength: 1000, supportsReasoning: false, supportsImageIn: false, supportsVideoIn: false },
      { id: 'model-b', contextLength: 2000, supportsReasoning: false, supportsImageIn: false, supportsVideoIn: false },
    ];

    const filtered = filterModelsByPrefix(models as unknown as import('../src/managed-miki-code').ManagedMikiCodeModelInfo[], platform);
    expect(filtered).toHaveLength(2);
  });
});

describe('fetchOpenPlatformModels supports_thinking_type', () => {
  it('parses supports_thinking_type from the models endpoint', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'miki-k2-deep',
                context_length: 256000,
                supports_reasoning: true,
                supports_thinking_type: 'only',
              },
              {
                id: 'miki-k2-lite',
                context_length: 128000,
                supports_reasoning: false,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const platform = getOpenPlatformById('mymoon-cn')!;

    const models = await fetchOpenPlatformModels(platform, 'sk-test', fetchMock as unknown as typeof fetch);

    expect(models[0]?.supportsThinkingType).toBe('only');
    expect(models[1]?.supportsThinkingType).toBeUndefined();
  });
});

describe('capabilitiesForModel', () => {
  it("locks thinking on for 'only' models", () => {
    const model = {
      id: 'deep',
      contextLength: 1000,
      supportsReasoning: true,
      supportsImageIn: false,
      supportsVideoIn: false,
      supportsToolUse: false,
      supportsThinkingType: 'only' as const,
    };
    expect(capabilitiesForModel(model)).toEqual(['thinking', 'always_thinking']);
  });

  it("lets 'no' override the legacy supports_reasoning boolean", () => {
    const model = {
      id: 'plain',
      contextLength: 1000,
      supportsReasoning: true,
      supportsImageIn: false,
      supportsVideoIn: false,
      supportsToolUse: false,
      supportsThinkingType: 'no' as const,
    };
    expect(capabilitiesForModel(model)).toBeUndefined();
  });

  it("emits a plain toggleable thinking capability for 'both'", () => {
    const model = {
      id: 'toggle',
      contextLength: 1000,
      supportsReasoning: false,
      supportsImageIn: false,
      supportsVideoIn: false,
      supportsToolUse: false,
      supportsThinkingType: 'both' as const,
    };
    expect(capabilitiesForModel(model)).toEqual(['thinking']);
  });

  it('returns undefined for a model with no capabilities', () => {
    const model = {
      id: 'plain',
      contextLength: 1000,
      supportsReasoning: false,
      supportsImageIn: false,
      supportsVideoIn: false,
      supportsToolUse: false,
    };
    expect(capabilitiesForModel(model)).toBeUndefined();
  });

  it('returns all caps for a full-featured model', () => {
    const model = {
      id: 'full',
      contextLength: 1000,
      supportsReasoning: true,
      supportsImageIn: true,
      supportsVideoIn: true,
      supportsToolUse: true,
    };
    expect(capabilitiesForModel(model)).toEqual(['thinking', 'image_in', 'video_in', 'tool_use']);
  });
});

describe('applyOpenPlatformConfig', () => {
  it('writes provider, models, and defaults', () => {
    const config: ManagedMikiConfigShape = {
      providers: {},
    };
    const platform = getOpenPlatformById('mymoon-cn')!;
    const models = [
      { id: 'miki-k2-0712-preview', contextLength: 256000, supportsReasoning: true, supportsImageIn: true, supportsVideoIn: true, displayName: 'Miki K2' },
      { id: 'miki-k2-lite', contextLength: 128000, supportsReasoning: false, supportsImageIn: false, supportsVideoIn: false },
    ];

    const result = applyOpenPlatformConfig(config, {
      platform,
      models,
      selectedModel: models[0]!,
      thinking: true,
      credential: { apiKey: 'sk-test' },
    });

    expect(result).toEqual({
      defaultModel: 'mymoon-cn/miki-k2-0712-preview',
      defaultThinking: true,
    });

    expect(config.providers['mymoon-cn']).toMatchObject({
      type: 'miki',
      baseUrl: 'https://api.mymoon.cn/v1',
      apiKey: 'sk-test',
    });
    expect(config.models?.['mymoon-cn/miki-k2-0712-preview']).toMatchObject({
      provider: 'mymoon-cn',
      model: 'miki-k2-0712-preview',
      maxContextSize: 256000,
      capabilities: ['thinking', 'image_in', 'video_in', 'tool_use'],
      displayName: 'Miki K2',
    });
    expect(config.defaultModel).toBe('mymoon-cn/miki-k2-0712-preview');
    expect(config.thinking?.enabled).toBe(true);
    expect(config.services).toBeUndefined();
  });

  it('clears stale models for the same provider', () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        'mymoon-cn': { type: 'miki', baseUrl: 'https://api.mymoon.cn/v1', apiKey: 'sk-old' },
      },
      models: {
        'mymoon-cn/stale': { provider: 'mymoon-cn', model: 'stale', maxContextSize: 1000 },
        'other/model': { provider: 'other', model: 'other-model', maxContextSize: 1000 },
      },
    };
    const platform = getOpenPlatformById('mymoon-cn')!;
    const models = [
      { id: 'miki-k2-0712-preview', contextLength: 256000, supportsReasoning: true, supportsImageIn: true, supportsVideoIn: true },
    ];

    applyOpenPlatformConfig(config, {
      platform,
      models,
      selectedModel: models[0]!,
      thinking: false,
      credential: { apiKey: 'sk-new' },
    });

    expect(config.models?.['mymoon-cn/stale']).toBeUndefined();
    expect(config.models?.['other/model']).toBeDefined();
  });

  it('preserves hand-edited fields that upstream does not declare', () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        'mymoon-cn': { type: 'miki', baseUrl: 'https://api.mymoon.cn/v1', apiKey: 'sk-old' },
      },
      models: {
        'mymoon-cn/miki-k2-0712-preview': {
          provider: 'mymoon-cn',
          model: 'miki-k2-0712-preview',
          maxContextSize: 256000,
          maxOutputSize: 8192,
          supportEfforts: ['low', 'high'],
        } as Record<string, unknown>,
      },
    };
    const platform = getOpenPlatformById('mymoon-cn')!;
    const models = [
      {
        id: 'miki-k2-0712-preview',
        contextLength: 256000,
        supportsReasoning: true,
        supportsImageIn: true,
        supportsVideoIn: true,
      },
    ];

    applyOpenPlatformConfig(config, {
      platform,
      models,
      selectedModel: models[0]!,
      thinking: false,
      credential: { apiKey: 'sk-new' },
    });

    const alias = config.models?.['mymoon-cn/miki-k2-0712-preview'];
    expect(alias?.['maxOutputSize']).toBe(8192);
    expect(alias?.['supportEfforts']).toBeUndefined();
  });

  it('preserves open-platform overrides during refresh', () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        'mymoon-cn': { type: 'miki', baseUrl: 'https://api.mymoon.cn/v1', apiKey: 'sk-old' },
      },
      models: {
        'mymoon-cn/miki-k2-0712-preview': {
          provider: 'mymoon-cn',
          model: 'miki-k2-0712-preview',
          maxContextSize: 256000,
          overrides: { supportEfforts: ['low'] },
        } as Record<string, unknown>,
      },
    };
    const platform = getOpenPlatformById('mymoon-cn')!;
    const models = [
      {
        id: 'miki-k2-0712-preview',
        contextLength: 256000,
        supportsReasoning: true,
        supportsImageIn: false,
        supportsVideoIn: false,
        supportEfforts: ['low', 'high'],
      },
    ];

    applyOpenPlatformConfig(config, {
      platform,
      models,
      selectedModel: models[0]!,
      thinking: false,
      credential: { apiKey: 'sk-new' },
    });

    const alias = config.models?.['mymoon-cn/miki-k2-0712-preview'];
    expect(alias?.['supportEfforts']).toEqual(['low', 'high']);
    expect(alias?.['overrides']).toEqual({ supportEfforts: ['low'] });
  });

  it('writes a concrete effort into config.thinking when provided', () => {
    const config: ManagedMikiConfigShape = { providers: {} };
    const platform = getOpenPlatformById('mymoon-cn')!;
    const models = [
      {
        id: 'miki-k2-0712-preview',
        contextLength: 256000,
        supportsReasoning: true,
        supportsImageIn: false,
        supportsVideoIn: false,
      },
    ];

    applyOpenPlatformConfig(config, {
      platform,
      models,
      selectedModel: models[0]!,
      thinking: true,
      effort: 'high',
      credential: { apiKey: 'sk-test' },
    });

    expect(config.thinking).toEqual({ enabled: true, effort: 'high' });
  });

  it('omits effort for a boolean on (no concrete effort)', () => {
    const config: ManagedMikiConfigShape = { providers: {} };
    const platform = getOpenPlatformById('mymoon-cn')!;
    const models = [
      {
        id: 'miki-k2-0712-preview',
        contextLength: 256000,
        supportsReasoning: true,
        supportsImageIn: false,
        supportsVideoIn: false,
      },
    ];

    applyOpenPlatformConfig(config, {
      platform,
      models,
      selectedModel: models[0]!,
      thinking: true,
      credential: { apiKey: 'sk-test' },
    });

    expect(config.thinking).toEqual({ enabled: true });
    expect(config.thinking?.effort).toBeUndefined();
  });

  it('drops custom-registry provenance when materializing an open platform', () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        'mymoon-cn': {
          type: 'openai',
          baseUrl: 'https://registry.example.test/v1',
          apiKey: 'sk-registry',
          source: {
            kind: 'apiJson',
            url: 'https://registry.example.test/api.json',
            apiKey: 'sk-registry',
          },
        },
      },
    };
    const platform = getOpenPlatformById('mymoon-cn')!;
    const models = [
      {
        id: 'miki-k2',
        contextLength: 131072,
        supportsReasoning: false,
        supportsImageIn: false,
        supportsVideoIn: false,
      },
    ];

    applyOpenPlatformConfig(config, {
      platform,
      models,
      selectedModel: models[0]!,
      thinking: false,
      credential: { apiKey: 'sk-registry' },
    });

    expect(config.providers['mymoon-cn']).not.toHaveProperty('source');
  });

  it('persists the apiKeyEnv declaration instead of a resolved secret and keeps hand-written fields', () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        'mymoon-cn': {
          type: 'miki',
          baseUrl: 'https://api.mymoon.cn/v1',
          apiKey: 'sk-resolved-secret',
          customHeaders: { 'X-Team': 'infra' },
        },
      },
    };
    const platform = getOpenPlatformById('mymoon-cn')!;
    const models = [
      {
        id: 'miki-k2',
        contextLength: 131072,
        supportsReasoning: false,
        supportsImageIn: false,
        supportsVideoIn: false,
      },
    ];

    applyOpenPlatformConfig(config, {
      platform,
      models,
      selectedModel: models[0]!,
      thinking: false,
      credential: { apiKeyEnv: 'MIKI_TEST_OPEN_PLATFORM_KEY' },
    });

    expect(config.providers['mymoon-cn']).toEqual({
      type: 'miki',
      baseUrl: 'https://api.mymoon.cn/v1',
      apiKeyEnv: 'MIKI_TEST_OPEN_PLATFORM_KEY',
      customHeaders: { 'X-Team': 'infra' },
    });
  });
});

describe('removeOpenPlatformConfig', () => {
  it('removes provider, its models, and defaultModel when matched', () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        'mymoon-cn': { type: 'miki', baseUrl: 'https://api.mymoon.cn/v1', apiKey: 'sk-test' },
        'other': { type: 'miki', baseUrl: 'https://other.test/v1', apiKey: 'sk-other' },
      },
      models: {
        'mymoon-cn/miki-k2': { provider: 'mymoon-cn', model: 'miki-k2', maxContextSize: 256000 },
        'other/model': { provider: 'other', model: 'other-model', maxContextSize: 1000 },
      },
      defaultModel: 'mymoon-cn/miki-k2',
    };

    removeOpenPlatformConfig(config, 'mymoon-cn');

    expect(config.providers['mymoon-cn']).toBeUndefined();
    expect(config.providers['other']).toBeDefined();
    expect(config.models?.['mymoon-cn/miki-k2']).toBeUndefined();
    expect(config.models?.['other/model']).toBeDefined();
    expect(config.defaultModel).toBeUndefined();
  });

  it('leaves defaultModel intact when it belongs to another provider', () => {
    const config: ManagedMikiConfigShape = {
      providers: {
        'mymoon-cn': { type: 'miki', baseUrl: 'https://api.mymoon.cn/v1', apiKey: 'sk-test' },
      },
      models: {
        'mymoon-cn/miki-k2': { provider: 'mymoon-cn', model: 'miki-k2', maxContextSize: 256000 },
      },
      defaultModel: 'other/model',
    };

    removeOpenPlatformConfig(config, 'mymoon-cn');

    expect(config.defaultModel).toBe('other/model');
  });
});
