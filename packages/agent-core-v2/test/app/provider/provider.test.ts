import { describe, expect, it } from 'vitest';

import { ConfigRegistry } from '#/app/config/configService';
import {
  ENV_MODEL_PROVIDER_KEY,
  PROVIDERS_SECTION,
  providersEnvBindings,
  providersFromToml,
  providersToToml,
  stripProvidersEnv,
} from '#/app/kosongConfig/configSection';

describe('providers config section', () => {
  it('self-registers the schema with the env bindings and strip hook', () => {
    const registry = new ConfigRegistry();
    expect(registry.getSection(PROVIDERS_SECTION)).toMatchObject({
      domain: PROVIDERS_SECTION,
      env: providersEnvBindings,
      stripEnv: stripProvidersEnv,
    });
  });
});

describe('provider config section helpers', () => {
  it('declares MIKI_MODEL_* bindings for the env provider', () => {
    expect(providersEnvBindings).toEqual({
      [ENV_MODEL_PROVIDER_KEY]: {
        apiKey: 'MIKI_MODEL_API_KEY',
        type: 'MIKI_MODEL_PROVIDER_TYPE',
        baseUrl: 'MIKI_MODEL_BASE_URL',
      },
    });
  });

  it('strips only the env provider before write-back', () => {
    expect(
      stripProvidersEnv({
        user: { type: 'miki', apiKey: 'sk-user' },
        [ENV_MODEL_PROVIDER_KEY]: { type: 'openai', apiKey: 'sk-env' },
      }),
    ).toEqual({
      user: { type: 'miki', apiKey: 'sk-user' },
    });
  });

  it('maps provider entries from TOML snake_case to camelCase', () => {
    expect(
      providersFromToml({
        miki: {
          type: 'miki',
          api_key: 'sk',
          base_url: 'https://api.example.com/v1',
          custom_headers: { 'X-Test': '1' },
          oauth: { storage: 'file', key: 'token', oauth_host: 'https://auth.example.com' },
        },
      }),
    ).toEqual({
      miki: {
        type: 'miki',
        apiKey: 'sk',
        baseUrl: 'https://api.example.com/v1',
        customHeaders: { 'X-Test': '1' },
        oauth: { storage: 'file', key: 'token', oauthHost: 'https://auth.example.com' },
      },
    });
  });

  it('maps provider entries back to TOML snake_case', () => {
    expect(
      providersToToml(
        {
          miki: {
            type: 'miki',
            apiKey: 'sk',
            baseUrl: 'https://api.example.com/v1',
            customHeaders: { 'X-Test': '1' },
            oauth: { storage: 'file', key: 'token', oauthHost: 'https://auth.example.com' },
          },
        },
        {},
      ),
    ).toEqual({
      miki: {
        type: 'miki',
        api_key: 'sk',
        base_url: 'https://api.example.com/v1',
        custom_headers: { 'X-Test': '1' },
        oauth: { storage: 'file', key: 'token', oauth_host: 'https://auth.example.com' },
      },
    });
  });
});
