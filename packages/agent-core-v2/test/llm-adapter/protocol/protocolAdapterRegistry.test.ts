import { beforeEach, afterEach, describe, expect, it } from 'vitest';

import { isUnknownCapability } from '#/llm-adapter/contract/capability';
import { thinkingMetadataOf } from '#human/llm/thinking';
import type { Model } from '#/llm-adapter/model/catalog';
import { ProtocolAdapterRegistry } from '#/llm-adapter/protocol/protocolAdapterRegistry';
import {
  getProviderDefinition,
  getProviderDefinitions,
  hasProviderDefinition,
  registerProviderDefinition,
  resolveProviderEndpoint,
} from '#/llm-adapter/provider/provider-definition';

const ENV_KEYS = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'MIKI_API_KEY',
  'MIKI_BASE_URL',
  'GOOGLE_API_KEY',
  'VERTEXAI_API_KEY',
] as const;

let envSnapshot: Record<string, string | undefined>;

beforeEach(() => {
  envSnapshot = {};
  for (const key of ENV_KEYS) {
    envSnapshot[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = envSnapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

registerProviderDefinition({
  id: 'cap-vendor',
  baseProtocol: 'openai',
  capability: (modelName: string) =>
    modelName === 'special-model'
      ? {
          image_in: true,
          video_in: false,
          audio_in: false,
          thinking: false,
          tool_use: true,
        }
      : undefined,
});

const registry = new ProtocolAdapterRegistry();

function modelWith(spec: {
  readonly protocol: Model['protocol'];
  readonly providerType?: string;
  readonly providerOptions?: Model['providerOptions'];
  readonly reasoningKey?: string;
  readonly supportEfforts?: readonly string[];
}): Model {
  return {
    id: 'm1',
    name: 'wire-model',
    aliases: [],
    protocol: spec.protocol,
    headers: {},
    capabilities: {
      image_in: false,
      video_in: false,
      audio_in: false,
      thinking: false,
      tool_use: true,
      max_context_tokens: 128000,
    },
    maxContextSize: 128000,
    alwaysThinking: false,
    providerType: spec.providerType,
    providerName: spec.providerType ?? spec.protocol,
    reasoningKey: spec.reasoningKey,
    supportEfforts: spec.supportEfforts,
    providerOptions: spec.providerOptions,
  };
}

describe('supportedProtocols', () => {
  it('lists the four wire protocols and contains neither miki nor vertexai', () => {
    const protocols = registry.supportedProtocols();
    expect(protocols).toHaveLength(4);
    expect([...protocols].toSorted()).toEqual(
      ['anthropic', 'google-genai', 'openai', 'openai_responses'].toSorted(),
    );
    expect(protocols).not.toContain('miki');
    expect(protocols).not.toContain('vertexai');
  });
});

describe('resolveAdapterIdentity', () => {
  it('resolves the miki pair registrations to their vendor traits', () => {
    expect(registry.resolveAdapterIdentity('openai', 'miki').baseId).toBe('openai');
    expect(registry.resolveAdapterIdentity('openai', 'miki').trait).toBeDefined();
    expect(registry.resolveAdapterIdentity('anthropic', 'miki').baseId).toBe('anthropic');
    expect(registry.resolveAdapterIdentity('anthropic', 'miki').trait).toBeDefined();
    expect(registry.resolveAdapterIdentity('openai_responses', 'miki').baseId).toBe(
      'openai_responses',
    );
    expect(registry.resolveAdapterIdentity('openai_responses', 'miki').trait).toBeDefined();
  });

  it('resolves unregistered pairs to the protocol itself with no vendor trait', () => {
    const google = registry.resolveAdapterIdentity('google-genai', 'miki');
    expect(google.baseId).toBe('google-genai');
    expect(google.trait).toBeUndefined();
    const unknown = registry.resolveAdapterIdentity('openai', 'no-such-vendor');
    expect(unknown.baseId).toBe('openai');
    expect(unknown.trait).toBeUndefined();
  });

  it('resolves the no-providerType branch identically', () => {
    const identity = registry.resolveAdapterIdentity('openai');
    expect(identity.baseId).toBe('openai');
    expect(identity.trait).toBeUndefined();
  });
});

describe('resolveProviderBaseId', () => {
  it('returns the pair registration’s baseProtocol — the protocol itself by construction', () => {
    expect(registry.resolveProviderBaseId('openai', 'miki')).toBe('openai');
    expect(registry.resolveProviderBaseId('anthropic', 'miki')).toBe('anthropic');
  });

  it('returns the protocol itself otherwise', () => {
    expect(registry.resolveProviderBaseId('google-genai', 'miki')).toBe('google-genai');
    expect(registry.resolveProviderBaseId('openai', 'no-such-vendor')).toBe('openai');
    expect(registry.resolveProviderBaseId('openai')).toBe('openai');
  });
});

describe('resolveCapability', () => {
  it('falls back to trait capability hooks before the base catalog', () => {
    const fromTrait = registry.resolveCapability('openai', 'special-model', 'cap-vendor');
    expect(fromTrait.image_in).toBe(true);
    const fromBase = registry.resolveCapability('openai', 'gpt-4o', 'cap-vendor');
    expect(fromBase.image_in).toBe(true);
  });

  it('falls back to the base catalog and then to UNKNOWN', () => {
    expect(registry.resolveCapability('openai', 'gpt-4o').image_in).toBe(true);
    expect(isUnknownCapability(registry.resolveCapability('openai', 'mystery-model'))).toBe(true);
    expect(registry.resolveCapability('anthropic', 'claude-opus-4-1').thinking).toBe(true);
  });

  it('miki declares no vendor-level capability — the base catalog answers instead', () => {
    expect(isUnknownCapability(registry.resolveCapability('openai', 'miki-for-coding', 'miki'))).toBe(
      true,
    );
    expect(registry.resolveCapability('openai', 'gpt-4o', 'miki').image_in).toBe(true);
  });
});

describe('resolve gateway routes', () => {
  it('routes miki+openai to the miki trait with the video upload media', () => {
    const resolved = registry.resolve(modelWith({ protocol: 'openai', providerType: 'miki' }));
    expect(resolved.protocol).toBe('openai');
    expect(resolved.model.provider).toBe('openai');
    expect(resolved.model.model).toBe('wire-model');
    expect(typeof resolved.media?.uploadVideo).toBe('function');
    expect(typeof resolved.media?.uploadImage).toBe('function');
  });

  it('routes plain openai without the upload media', () => {
    const resolved = registry.resolve(modelWith({ protocol: 'openai' }));
    expect(resolved.protocol).toBe('openai');
    expect(resolved.media?.uploadVideo).toBeUndefined();
    expect(resolved.media?.uploadImage).toBeUndefined();
  });

  it('reports the wire protocol regardless of beta or vertex provider options', () => {
    const beta = registry.resolve(
      modelWith({ protocol: 'anthropic', providerOptions: { betaApi: true } }),
    );
    expect(beta.protocol).toBe('anthropic');
    const vertex = registry.resolve(
      modelWith({
        protocol: 'google-genai',
        providerOptions: { vertexai: true, project: 'p', location: 'l' },
      }),
    );
    expect(vertex.protocol).toBe('google-genai');
  });

  it('routes miki+anthropic through the miki anthropic trait with media', () => {
    const resolved = registry.resolve(modelWith({ protocol: 'anthropic', providerType: 'miki' }));
    expect(resolved.protocol).toBe('anthropic');
    expect(typeof resolved.media?.uploadVideo).toBe('function');
    expect(typeof resolved.media?.uploadImage).toBe('function');
  });

  it('carries thinking metadata and model limits onto the resolved LlmModel', () => {
    const resolved = registry.resolve(
      modelWith({
        protocol: 'anthropic',
        supportEfforts: ['low', 'high'],
        providerOptions: { supportEfforts: ['low', 'high'], adaptiveThinking: true },
      }),
    );
    expect(resolved.model.maxContextSize).toBe(128000);
    expect(thinkingMetadataOf(resolved.model)).toMatchObject({
      supportEfforts: ['low', 'high'],
      adaptiveThinking: true,
    });
  });
});

describe('resolveProviderEndpoint', () => {
  it('resolves the miki endpoint chain from process.env', () => {
    process.env['MIKI_API_KEY'] = 'sk-miki-env';
    expect(resolveProviderEndpoint('miki')).toEqual({
      apiKey: 'sk-miki-env',
      baseUrl: 'https://api.mymoon.ai/v1',
    });
  });

  it('reads a caller-supplied env bag instead of process.env', () => {
    process.env['MIKI_API_KEY'] = 'sk-miki-env';
    expect(resolveProviderEndpoint('miki', { MIKI_BASE_URL: 'https://example.com/v1' })).toEqual({
      baseUrl: 'https://example.com/v1',
    });
  });

  it('aggregates the google-genai chain with the legacy vertex precedence', () => {
    expect(
      resolveProviderEndpoint('google-genai', {
        VERTEXAI_API_KEY: 'vertex-env-key',
        GOOGLE_API_KEY: 'google-env-key',
      }),
    ).toEqual({ apiKey: 'vertex-env-key' });
    expect(resolveProviderEndpoint('google-genai', { GOOGLE_API_KEY: 'google-env-key' })).toEqual({
      apiKey: 'google-env-key',
    });
    expect(
      resolveProviderEndpoint('google-genai', {
        GOOGLE_VERTEX_BASE_URL: 'https://vertex.example.test',
        GOOGLE_GEMINI_BASE_URL: 'https://gemini.example.test',
      }),
    ).toEqual({ baseUrl: 'https://vertex.example.test' });
    expect(
      resolveProviderEndpoint('google-genai', {
        GOOGLE_GEMINI_BASE_URL: 'https://gemini.example.test',
      }),
    ).toEqual({ baseUrl: 'https://gemini.example.test' });
  });

  it('returns {} for unregistered vendors', () => {
    expect(resolveProviderEndpoint('no-such-vendor')).toEqual({});
  });
});

describe('miki provider definitions', () => {
  it('registers one definition per transport, with shared vendor-level facts', () => {
    const native = getProviderDefinition('miki', 'openai');
    const anthropic = getProviderDefinition('miki', 'anthropic');
    const responses = getProviderDefinition('miki', 'openai_responses');
    expect(native?.baseProtocol).toBe('openai');
    expect(native?.trait).toBeDefined();
    expect(anthropic?.baseProtocol).toBe('anthropic');
    expect(anthropic?.trait).toBeDefined();
    expect(responses?.baseProtocol).toBe('openai_responses');
    expect(responses?.trait).toBeDefined();
    for (const definition of [native, anthropic, responses]) {
      expect(definition?.endpoint).toEqual({
        apiKeyEnv: 'MIKI_API_KEY',
        baseUrlEnv: 'MIKI_BASE_URL',
        defaultBaseUrl: 'https://api.mymoon.ai/v1',
      });
      expect(definition?.hostHeaders).toBe('full');
      expect(definition?.modelSource).toBe('oauth-catalog');
    }
  });

  it('answers id-level queries and reports unregistered pairs', () => {
    expect(getProviderDefinition('miki')?.baseProtocol).toBe('openai');
    expect(getProviderDefinitions('miki')).toHaveLength(3);
    expect(hasProviderDefinition('miki')).toBe(true);
    expect(hasProviderDefinition('no-such-vendor')).toBe(false);
    expect(getProviderDefinition('miki', 'google-genai')).toBeUndefined();
  });

  it('allows the same id on several protocols but rejects a duplicate (id, baseProtocol) pair', () => {
    registerProviderDefinition({
      id: 'pair-vendor',
      baseProtocol: 'openai',
    });
    registerProviderDefinition({
      id: 'pair-vendor',
      baseProtocol: 'anthropic',
    });
    expect(getProviderDefinition('pair-vendor', 'openai')).toBeDefined();
    expect(getProviderDefinition('pair-vendor', 'anthropic')).toBeDefined();
    expect(() =>
      registerProviderDefinition({
        id: 'pair-vendor',
        baseProtocol: 'openai',
      }),
    ).toThrow(/already registered/);
    expect(() =>
      registerProviderDefinition({
        id: 'miki',
        baseProtocol: 'openai',
      }),
    ).toThrow(/already registered/);
  });
});
