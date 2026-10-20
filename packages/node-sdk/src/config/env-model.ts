import { ErrorCodes, MikiError } from '#/errors';

import { parseBooleanEnv } from './resolve';
import {
  validateConfig,
  type MikiConfig,
  type ModelAlias,
  type ProviderConfig,
  type ProviderType,
  type ThinkingConfig,
} from './schema';

export const ENV_MODEL_PROVIDER_KEY = '__miki_env__';
export const ENV_MODEL_ALIAS_KEY = '__miki_env_model__';

const ALLOWED_TYPES: readonly ProviderType[] = ['miki', 'anthropic', 'openai'];

const DEFAULT_BASE_URL: Partial<Record<ProviderType, string>> = {
  miki: 'https://api.mymoon.ai/v1',
  openai: 'https://api.openai.com/v1',
};

const DEFAULT_MAX_CONTEXT_SIZE = 262144;

const DEFAULT_CAPABILITIES = ['image_in', 'thinking'];

type Env = Readonly<Record<string, string | undefined>>;

function trimmed(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t === undefined || t.length === 0 ? undefined : t;
}

function fail(message: string): never {
  throw new MikiError(ErrorCodes.CONFIG_INVALID, message);
}

function parsePositiveInt(raw: string, varName: string): number {
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
    fail(`${varName} must be a positive integer, got "${raw}".`);
  }
  return Number(raw);
}

function parseProviderType(raw: string | undefined): ProviderType {
  if (raw === undefined) return 'miki';
  const normalized = raw.toLowerCase() as ProviderType;
  if (!ALLOWED_TYPES.includes(normalized)) {
    fail(
      `MIKI_MODEL_PROVIDER_TYPE must be one of ${ALLOWED_TYPES.join(', ')}, got "${raw}".`,
    );
  }
  return normalized;
}

function parseCapabilities(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const caps = raw
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.length > 0);
  return caps.length === 0 ? undefined : caps;
}

function parseBooleanVar(raw: string | undefined, varName: string): boolean | undefined {
  const value = trimmed(raw);
  if (value === undefined) return undefined;
  const parsed = parseBooleanEnv(value);
  if (parsed === undefined) {
    fail(`${varName} must be a boolean (true/false/1/0/yes/no/on/off), got "${raw}".`);
  }
  return parsed;
}

export function applyEnvModelConfig(config: MikiConfig, env: Env = process.env): MikiConfig {
  const model = trimmed(env['MIKI_MODEL_NAME']);
  if (model === undefined) return config;

  const apiKey = trimmed(env['MIKI_MODEL_API_KEY']);
  if (apiKey === undefined) {
    fail('MIKI_MODEL_NAME is set but MIKI_MODEL_API_KEY is missing.');
  }

  const maxContextRaw = trimmed(env['MIKI_MODEL_MAX_CONTEXT_SIZE']);
  const maxContextSize =
    maxContextRaw === undefined
      ? DEFAULT_MAX_CONTEXT_SIZE
      : parsePositiveInt(maxContextRaw, 'MIKI_MODEL_MAX_CONTEXT_SIZE');

  const type = parseProviderType(trimmed(env['MIKI_MODEL_PROVIDER_TYPE']));
  const baseUrl = trimmed(env['MIKI_MODEL_BASE_URL']) ?? DEFAULT_BASE_URL[type];

  const provider: ProviderConfig = {
    type,
    apiKey,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
  };

  const maxOutputRaw = trimmed(env['MIKI_MODEL_MAX_OUTPUT_SIZE']);
  const maxOutputSize =
    maxOutputRaw !== undefined
      ? parsePositiveInt(maxOutputRaw, 'MIKI_MODEL_MAX_OUTPUT_SIZE')
      : undefined;
  const capabilities = parseCapabilities(env['MIKI_MODEL_CAPABILITIES']) ?? DEFAULT_CAPABILITIES;
  const displayName = trimmed(env['MIKI_MODEL_DISPLAY_NAME']);
  const reasoningKey = trimmed(env['MIKI_MODEL_REASONING_KEY']);
  const adaptiveThinking = parseBooleanVar(
    env['MIKI_MODEL_ADAPTIVE_THINKING'],
    'MIKI_MODEL_ADAPTIVE_THINKING',
  );

  const alias: ModelAlias = {
    provider: ENV_MODEL_PROVIDER_KEY,
    model,
    maxContextSize,
    capabilities,
    ...(displayName !== undefined ? { displayName } : {}),
    ...(maxOutputSize !== undefined ? { maxOutputSize } : {}),
    ...(reasoningKey !== undefined ? { reasoningKey } : {}),
    ...(adaptiveThinking !== undefined ? { adaptiveThinking } : {}),
  };

  const thinkingEffort = trimmed(env['MIKI_MODEL_THINKING_EFFORT']);
  const thinking: ThinkingConfig | undefined =
    thinkingEffort !== undefined ? { ...config.thinking, effort: thinkingEffort } : config.thinking;

  const merged: MikiConfig = {
    ...config,
    providers: { ...config.providers, [ENV_MODEL_PROVIDER_KEY]: provider },
    models: { ...config.models, [ENV_MODEL_ALIAS_KEY]: alias },
    defaultModel: ENV_MODEL_ALIAS_KEY,
    ...(thinking !== undefined ? { thinking } : {}),
  };

  return validateConfig(merged);
}

export function stripEnvModelConfig(config: MikiConfig): MikiConfig {
  const hasProvider = ENV_MODEL_PROVIDER_KEY in config.providers;
  const hasModel = config.models !== undefined && ENV_MODEL_ALIAS_KEY in config.models;
  const defaultIsEnv = config.defaultModel === ENV_MODEL_ALIAS_KEY;
  if (!hasProvider && !hasModel && !defaultIsEnv) return config;

  const providers = { ...config.providers };
  delete providers[ENV_MODEL_PROVIDER_KEY];

  let models = config.models;
  if (models !== undefined && ENV_MODEL_ALIAS_KEY in models) {
    models = { ...models };
    delete models[ENV_MODEL_ALIAS_KEY];
  }

  return {
    ...config,
    providers,
    ...(models !== undefined ? { models } : {}),
    ...(defaultIsEnv ? { defaultModel: rawDefaultModel(config) } : {}),
    thinking: rawThinking(config),
  };
}

function rawDefaultModel(config: MikiConfig): string | undefined {
  const raw = config.raw?.['default_model'];
  return typeof raw === 'string' ? raw : undefined;
}

function rawThinking(config: MikiConfig): ThinkingConfig | undefined {
  const raw = config.raw?.['thinking'];
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as ThinkingConfig)
    : undefined;
}
