import { emptyUsage } from '#human/llm/usage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IAgentLLMRequesterService } from '#/agent/llmRequester/llmRequester';
import { IAgentProfileService } from '#/agent/profile/profile';
import { ITelemetryService } from '#/app/telemetry/telemetry';
import type { ModelRecord } from '#/llm-adapter/model/model';
import {
  configServices,
  createTestAgent,
  InMemoryWireRecordPersistence,
  llmGenerateServices,
  modelProviderOptionServices,
  requesterFromGenerateFn,
  telemetryServices,
  wireRecordPersistenceServices,
  type LegacyGenerateFn,
  type TestAgentContext,
} from '../../harness';
import { recordingTelemetry, type TelemetryRecord } from '../../app/telemetry/stubs';

type TestMikiConfig = ReturnType<Parameters<typeof configServices>[0]>;
type TestProtocolModelConfig = NonNullable<TestMikiConfig['models']>[string] &
  Pick<ModelRecord, 'protocol'>;
type GenerateFn = Parameters<typeof llmGenerateServices>[0];

function defaultGenerate(): GenerateFn {
  return {
    generate: () => Promise.reject(new Error('generate should not be called')),
  };
}

describe('ConfigState model capabilities', () => {
  let ctx: TestAgentContext;
  let profile: IAgentProfileService;
  let requester: IAgentLLMRequesterService;
  let mikiConfig: TestMikiConfig;
  let generate: GenerateFn;
  let records: TelemetryRecord[];

  beforeEach(() => {
    mikiConfig = {
      providers: {},
    };
    generate = defaultGenerate();
    records = [];
    ctx = createTestAgent(
      configServices(() => mikiConfig),
      llmGenerateServices({
        generate: (config, content, control) => generate.generate(config, content, control),
      }),
      telemetryServices(recordingTelemetry(records)),
    );
    profile = ctx.get(IAgentProfileService);
    requester = ctx.get(IAgentLLMRequesterService);
  });

  afterEach(async () => {
    try {
      await ctx.expectResumeMatches();
    } finally {
      await ctx.dispose();
    }
  });

  it('computes provider and model capabilities from config metadata', () => {
    mikiConfig = {
      providers: {
        miki: {
          type: 'miki',
          apiKey: 'test-key',
          baseUrl: 'https://api.example.test/v1',
        },
      },
      models: {
        'miki-code/miki-for-coding': {
          provider: 'miki',
          model: 'miki-for-coding',
          maxContextSize: 1_000_000,
          supportEfforts: ['low', 'high'],
          capabilities: ['image_in', 'video_in', 'thinking', 'tool_use'],
        },
      },
    };

    profile.update({ modelAlias: 'miki-code/miki-for-coding' });

    expect(profile.getModel()).toBe('miki-code/miki-for-coding');
    expect(ctx.modelResolver.get('miki-code/miki-for-coding').name).toBe('miki-for-coding');
    expect(profile.getModelCapabilities()).toMatchObject({
      image_in: true,
      video_in: true,
      audio_in: false,
      thinking: true,
      tool_use: true,
      max_context_tokens: 1_000_000,
    });
  });

  it('republishes the model status slice on demand', () => {
    mikiConfig = {
      providers: {
        miki: {
          type: 'miki',
          apiKey: 'test-key',
          baseUrl: 'https://api.example.test/v1',
        },
      },
      models: {
        'miki-code/miki-for-coding': {
          provider: 'miki',
          model: 'miki-for-coding',
          maxContextSize: 1_000_000,
          supportEfforts: ['low', 'high'],
        },
      },
    };
    profile.update({ modelAlias: 'miki-code/miki-for-coding' });
    const before = ctx.allEvents.filter((entry) => entry.event === 'agent.status.updated').length;

    profile.republishStatus();

    const statuses = ctx.allEvents.filter((entry) => entry.event === 'agent.status.updated');
    expect(statuses).toHaveLength(before + 1);
    expect(statuses.at(-1)?.args).toMatchObject({
      model: 'miki-code/miki-for-coding',
      maxContextTokens: 1_000_000,
    });
  });

  it('omits maxContextTokens when the bound model no longer resolves', () => {
    profile.update({ modelAlias: 'ghost/model' });

    const statuses = ctx.allEvents.filter((entry) => entry.event === 'agent.status.updated');
    expect(statuses.length).toBeGreaterThan(0);
    const last = statuses.at(-1)?.args as { model?: string; maxContextTokens?: number };
    expect(last.model).toBe('ghost/model');
    expect(last.maxContextTokens).toBeUndefined();
  });

  it('tracks thinking_toggle with the effort payload when effort changes', () => {
    mikiConfig = {
      providers: {
        miki: {
          type: 'miki',
          apiKey: 'test-key',
          baseUrl: 'https://api.example.test/v1',
        },
      },
      models: {
        'miki-code/miki-for-coding': {
          provider: 'miki',
          model: 'miki-for-coding',
          maxContextSize: 1_000_000,
          capabilities: ['thinking'],
          supportEfforts: ['low', 'high'],
        },
      },
    };
    profile.update({ modelAlias: 'miki-code/miki-for-coding' });
    profile.setThinking('off');
    records.length = 0;

    profile.setThinking('low');

    expect(records).toContainEqual({
      event: 'thinking_toggle',
      properties: {
        agent_id: 'main',
        enabled: true,
        effort: 'low',
        from: 'off',
        mode: 'agent',
        model: 'miki-code/miki-for-coding',
        protocol: 'openai',
        provider_type: 'miki',
      },
    });
  });

  it('writes the bound model into the ambient telemetry context', () => {
    mikiConfig = {
      providers: {
        miki: {
          type: 'miki',
          apiKey: 'test-key',
          baseUrl: 'https://api.example.test/v1',
        },
      },
      models: {
        'miki-code/miki-for-coding': {
          provider: 'miki',
          model: 'miki-for-coding',
          maxContextSize: 1_000_000,
        },
      },
    };

    profile.update({ modelAlias: 'miki-code/miki-for-coding' });

    expect(ctx.get(ITelemetryService).getContext()).toMatchObject({
      model: 'miki-code/miki-for-coding',
      provider_type: 'miki',
      protocol: 'openai',
    });
  });

  it('keeps the alias as ambient model when the bound model does not resolve', () => {
    profile.update({ modelAlias: 'ghost/model' });

    expect(ctx.get(ITelemetryService).getContext()).toMatchObject({
      model: 'ghost/model',
    });
  });

  it('restores the ambient model after a cold resume', async () => {
    mikiConfig = {
      providers: {
        miki: {
          type: 'miki',
          apiKey: 'test-key',
          baseUrl: 'https://api.example.test/v1',
        },
      },
      models: {
        'miki-code/miki-for-coding': {
          provider: 'miki',
          model: 'miki-for-coding',
          maxContextSize: 1_000_000,
        },
      },
    };
    const resumedRecords: TelemetryRecord[] = [];
    const resumed = createTestAgent(
      { autoConfigure: false },
      configServices(() => mikiConfig),
      llmGenerateServices({
        generate: (config, content, control) => generate.generate(config, content, control),
      }),
      telemetryServices(recordingTelemetry(resumedRecords)),
      wireRecordPersistenceServices(
        new InMemoryWireRecordPersistence([
          { type: 'config.update', agentId: 'main', modelAlias: 'miki-code/miki-for-coding' },
        ]),
      ),
    );
    try {
      await resumed.restorePersisted();

      expect(resumed.get(ITelemetryService).getContext()).toMatchObject({
        model: 'miki-code/miki-for-coding',
        provider_type: 'miki',
        protocol: 'openai',
      });
    } finally {
      await resumed.dispose();
    }
  });

  it('does not infer Miki capabilities from the provider catalogue', () => {
    mikiConfig = {
      providers: {
        miki: {
          type: 'miki',
          apiKey: 'test-key',
          baseUrl: 'https://api.example.test/v1',
        },
      },
      models: {
        'miki-code': {
          provider: 'miki',
          model: 'miki-code',
          maxContextSize: 128_000,
        },
      },
    };

    profile.update({ modelAlias: 'miki-code' });

    expect(profile.getModelCapabilities()).toMatchObject({
      image_in: false,
      video_in: false,
      audio_in: false,
      max_context_tokens: 128_000,
    });
  });

  it('uses model max output size as the LLM completion cap', async () => {
    let requestMaxTokens: unknown;
    mikiConfig = {
      providers: {
        deepseek: {
          type: 'openai',
          apiKey: 'test-key',
          baseUrl: 'https://api.deepseek.example/v1',
        },
      },
      models: {
        'deepseek/deepseek-v4-flash': {
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
          maxContextSize: 1_000_000,
          maxOutputSize: 384_000,
        },
      },
    };
    generate = requesterFromGenerateFn(async (_provider, _systemPrompt, _tools, _history, _callbacks, options) => {
      requestMaxTokens = options?.maxCompletionTokens;
      return {
        id: 'response-1',
        message: { role: 'assistant', content: [], toolCalls: [] },
        usage: emptyUsage(),
        finishReason: 'completed',
        rawFinishReason: 'stop',
      };
    });

    profile.update({
      modelAlias: 'deepseek/deepseek-v4-flash',
      systemPrompt: 'system',
      thinkingLevel: 'off',
    });
    await requester.request({}, undefined, new AbortController().signal);

    expect(requestMaxTokens).toBe(384000);
  });
});

describe('ConfigState prompt cache hint', () => {
  let ctx: TestAgentContext;
  let profile: IAgentProfileService;
  let mikiConfig: TestMikiConfig;

  beforeEach(() => {
    mikiConfig = {
      providers: {
        miki: {
          type: 'miki',
          apiKey: 'test-key',
          baseUrl: 'https://api.example.test/v1',
        },
      },
      models: {
        'miki-code': {
          provider: 'miki',
          model: 'miki-code',
          maxContextSize: 128_000,
        },
      },
    };
    ctx = createTestAgent(
      configServices(() => mikiConfig),
      modelProviderOptionServices({ promptCacheKey: 'session-test' }),
    );
    profile = ctx.get(IAgentProfileService);
  });

  afterEach(async () => {
    try {
      await ctx.expectResumeMatches();
    } finally {
      await ctx.dispose();
    }
  });

  it('uses session id as a provider prompt cache hint without storing it on Agent', () => {
    profile.update({ modelAlias: 'miki-code' });

    const model = ctx.modelResolver.get('miki-code');
    expect(model.protocol).toBe('openai');
    expect(model.providerType).toBe('miki');
    expect('sessionId' in ctx).toBe(false);
  });
});

describe('ConfigState thinking clamp for always-thinking models', () => {
  let ctx: TestAgentContext;
  let profile: IAgentProfileService;
  let requester: IAgentLLMRequesterService;
  let mikiConfig: TestMikiConfig;
  let capturedThinking: unknown;

  beforeEach(() => {
    mikiConfig = {
      providers: { miki: { type: 'miki', apiKey: 'test-key', baseUrl: 'https://api.example.test/v1' } },
      models: {
        'miki-code/deep': {
          provider: 'miki',
          model: 'miki-deep-coder',
          maxContextSize: 128_000,
          capabilities: ['thinking', 'always_thinking', 'tool_use'],
          supportEfforts: ['low', 'high', 'max'],
        },
        'miki-code/toggle': {
          provider: 'miki',
          model: 'miki-for-coding',
          maxContextSize: 128_000,
          capabilities: ['thinking'],
        },
        'miki-code/custom': {
          provider: 'miki',
          model: 'miki-custom-coder',
          maxContextSize: 128_000,
          capabilities: ['thinking'],
          supportEfforts: ['low', 'medium', 'max'],
          defaultEffort: 'max',
        },
        'miki-code/ultra': {
          provider: 'miki',
          model: 'miki-ultra',
          maxContextSize: 128_000,
          capabilities: ['thinking'],
          supportEfforts: ['low', 'high', 'ultra'],
          defaultEffort: 'ultra',
        },
        'miki-code/compatible': {
          provider: 'miki',
          protocol: 'anthropic',
          model: 'compatible-model',
          maxContextSize: 128_000,
          capabilities: ['thinking', 'always_thinking'],
          supportEfforts: ['max'],
          defaultEffort: 'max',
        } as TestProtocolModelConfig,
      },
    };
    capturedThinking = undefined;
    ctx = createTestAgent(
      configServices(() => mikiConfig),
      llmGenerateServices(requesterFromGenerateFn(async (_provider, _systemPrompt, _tools, _history, _callbacks, options) => {
        capturedThinking = options?.thinking;
        return {
          id: 'response-1',
          message: { role: 'assistant', content: [], toolCalls: [] },
          usage: emptyUsage(),
          finishReason: 'completed',
          rawFinishReason: 'stop',
        };
      })),
    );
    profile = ctx.get(IAgentProfileService);
    requester = ctx.get(IAgentLLMRequesterService);
  });

  afterEach(async () => {
    try {
      await ctx.expectResumeMatches();
    } finally {
      await ctx.dispose();
    }
  });

  it('clamps thinkingLevel off to the configured effort', () => {
    profile.update({ modelAlias: 'miki-code/deep', thinkingLevel: 'off' });

    expect(profile.data().thinkingLevel).toBe('high');
  });

  it('sends the clamped thinking effort in the per-turn intent after thinking was set off', async () => {
    profile.update({ modelAlias: 'miki-code/deep', thinkingLevel: 'off' });

    await requester.request({}, undefined, new AbortController().signal);

    expect(capturedThinking).toMatchObject({ effort: 'high' });
  });

  it('keeps thinking off working for toggleable models', () => {
    profile.update({ modelAlias: 'miki-code/toggle', thinkingLevel: 'off' });

    expect(profile.data().thinkingLevel).toBe('off');
  });

  it('resolves an explicit on request to the model default effort', () => {
    profile.update({ modelAlias: 'miki-code/custom', thinkingLevel: 'on' });

    expect(profile.data().thinkingLevel).toBe('max');
  });

  it('re-clamps when switching to an always-on model after thinking was off', () => {
    profile.update({ modelAlias: 'miki-code/toggle', thinkingLevel: 'off' });
    expect(profile.data().thinkingLevel).toBe('off');

    profile.update({ modelAlias: 'miki-code/deep' });
    expect(profile.data().thinkingLevel).toBe('high');
  });

  it('falls back to the target default when a model switch carries an unsupported effort', () => {
    profile.update({ modelAlias: 'miki-code/ultra', thinkingLevel: 'ultra' });

    profile.update({ modelAlias: 'miki-code/custom' });

    expect(profile.data().thinkingLevel).toBe('max');
  });

  it('projects an inherited concrete effort to on when switching to a boolean model', () => {
    profile.update({ modelAlias: 'miki-code/ultra', thinkingLevel: 'ultra' });

    profile.update({ modelAlias: 'miki-code/toggle' });

    expect(profile.data().thinkingLevel).toBe('on');
  });

  it('rejects an unsupported effort explicitly set on the current Miki model', () => {
    profile.update({ modelAlias: 'miki-code/custom' });

    expect(() => {
      profile.setThinking('ultra');
    }).toThrow(
      'Thinking effort "ultra" is not supported by model "miki-code/custom"',
    );
  });

  it.each([
    [' HIGH ', 'high'],
    ['OFF', 'off'],
  ])('normalizes runtime effort %j to %s before validation', (input, expected) => {
    profile.update({ modelAlias: 'miki-code/ultra' });

    profile.setThinking(input);

    expect(profile.data().thinkingLevel).toBe(expected);
  });

  it('uses the model default when the runtime effort is blank', () => {
    profile.update({ modelAlias: 'miki-code/custom', thinkingLevel: 'low' });

    profile.setThinking('   ');

    expect(profile.data().thinkingLevel).toBe('max');
  });

  it('preserves unlisted efforts with a warning for Miki-managed Anthropic models', () => {
    profile.update({ modelAlias: 'miki-code/compatible', thinkingLevel: 'max' });

    expect(() => {
      profile.setThinking('high');
    }).not.toThrow();
    expect(profile.data().thinkingLevel).toBe('high');
    expect(ctx.allEvents).toContainEqual({
      type: '[rpc]',
      event: 'warning',
      args: expect.objectContaining({
        code: 'anthropic-thinking-effort-not-listed',
        message:
          'Thinking effort "high" is not listed for model "compatible-model" (known: max). The configured value will be sent unchanged to the Anthropic-compatible backend.',
      }),
    });
  });

  it('clamps off to the model default for always-on models, on any transport', () => {
    profile.update({ modelAlias: 'miki-code/compatible', thinkingLevel: 'max' });

    expect(() => {
      profile.setThinking('off');
    }).not.toThrow();
    expect(profile.data().thinkingLevel).toBe('max');
  });
});

describe('ConfigState.provider applies global MIKI_MODEL_* request config', () => {
  let ctx: TestAgentContext | undefined;
  let profile: IAgentProfileService;
  let requester: IAgentLLMRequesterService;
  let mikiConfig: TestMikiConfig;
  let capturedProvider: unknown;
  let capturedOptions: Parameters<LegacyGenerateFn>[5];

  beforeEach(() => {
    mikiConfig = {
      providers: { miki: { type: 'miki', apiKey: 'test-key', baseUrl: 'https://api.example.test/v1' } },
      models: {
        'miki-code': {
          provider: 'miki',
          model: 'miki-code',
          maxContextSize: 128_000,
          capabilities: ['thinking'],
        },
        'miki-code-anthropic': {
          provider: 'miki',
          protocol: 'anthropic',
          model: 'miki-code-anthropic',
          maxContextSize: 128_000,
          capabilities: ['thinking'],
          supportEfforts: ['low', 'high'],
        } as TestProtocolModelConfig,
      },
    };
    capturedProvider = undefined;
  });

  afterEach(async () => {
    try {
      await ctx?.expectResumeMatches();
    } finally {
      await ctx?.dispose();
      ctx = undefined;
      vi.unstubAllEnvs();
    }
  });

  function createAgentWithEnv(): void {
    ctx = createTestAgent(
      configServices(() => mikiConfig),
      llmGenerateServices(requesterFromGenerateFn(async (provider, _systemPrompt, _tools, _history, _callbacks, options) => {
        capturedProvider = provider;
        capturedOptions = options;
        return {
          id: 'response-1',
          message: { role: 'assistant', content: [], toolCalls: [] },
          usage: emptyUsage(),
          finishReason: 'completed',
          rawFinishReason: 'stop',
        };
      })),
    );
    profile = ctx.get(IAgentProfileService);
    requester = ctx.get(IAgentLLMRequesterService);
  }

  it('injects MIKI_MODEL_TEMPERATURE into the per-turn sampling intent (the compaction request also uses)', async () => {
    vi.stubEnv('MIKI_MODEL_TEMPERATURE', '0.3');
    createAgentWithEnv();

    profile.update({ modelAlias: 'miki-code' });
    await requester.request({}, undefined, new AbortController().signal);

    expect(capturedOptions?.sampling).toMatchObject({
      temperature: 0.3,
    });
  });

  it('injects MIKI_MODEL_THINKING_KEEP into the per-turn thinking intent when thinking is on (so compaction keeps it)', async () => {
    vi.stubEnv('MIKI_MODEL_THINKING_KEEP', 'all');
    createAgentWithEnv();

    profile.update({ modelAlias: 'miki-code', thinkingLevel: 'high' });
    await requester.request({}, undefined, new AbortController().signal);

    expect(capturedOptions?.thinking).toMatchObject({ effort: 'on', keep: 'all' });
  });

  it('does NOT inject thinking.keep into the per-turn intent when thinking is off', async () => {
    vi.stubEnv('MIKI_MODEL_THINKING_KEEP', 'all');
    createAgentWithEnv();

    profile.update({ modelAlias: 'miki-code', thinkingLevel: 'off' });
    await requester.request({}, undefined, new AbortController().signal);

    expect(capturedOptions?.thinking?.effort).toBe('off');
    expect(capturedOptions?.thinking?.keep).toBeUndefined();
  });

  it('injects forced effort through the Anthropic protocol for a Miki provider', async () => {
    vi.stubEnv('MIKI_MODEL_THINKING_EFFORT', 'max');
    createAgentWithEnv();

    profile.update({ modelAlias: 'miki-code-anthropic', thinkingLevel: 'high' });
    expect(profile.data().thinkingLevel).toBe('high');
    expect(profile.resolveModelContext().thinkingLevel).toBe('max');
    const statusEvent = ctx?.allEvents.findLast(
      (event) =>
        event.event === 'agent.status.updated' &&
        (event.args as { thinkingEffort?: unknown } | undefined)?.thinkingEffort !== undefined,
    );
    expect(statusEvent?.args).toMatchObject({
      model: 'miki-code-anthropic',
      thinkingEffort: 'max',
    });

    await requester.request({}, undefined, new AbortController().signal);

    expect(capturedProvider).toMatchObject({ name: 'anthropic' });
    expect(capturedOptions?.thinking?.effort).toBe('max');
  });
});
