import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createMikiHarness } from '@mymoon-ai/miki-code-sdk';

import { smokeIdentityFromEnv } from './runtime-smoke-helpers';

async function main(): Promise<void> {
  const homeDir = await mkdtemp(join(tmpdir(), 'miki-harness-config-home-'));
  const harness = createMikiHarness({ homeDir, identity: smokeIdentityFromEnv() });

  const initial = await harness.getConfig();
  if (Object.keys(initial.providers).length > 0) {
    throw new Error('expected empty providers for a fresh config home');
  }

  await harness.setConfig({
    defaultModel: 'miki-code/miki-for-coding',
    thinking: { enabled: true },
    defaultPermissionMode: 'manual',
    defaultPlanMode: false,
    providers: {
      'managed:miki-code': {
        type: 'miki',
        baseUrl: 'https://api.miki.com/coding/v1',
        apiKey: '',
        oauth: { storage: 'file', key: 'oauth/miki-code' },
      },
    },
    models: {
      'miki-code/miki-for-coding': {
        provider: 'managed:miki-code',
        model: 'miki-for-coding',
        maxContextSize: 262144,
        capabilities: ['image_in', 'thinking', 'video_in'],
        displayName: 'Miki for Coding',
      },
    },
    loopControl: {
      maxRetriesPerStep: 3,
      maxRalphIterations: 0,
      reservedContextSize: 50000,
      compactionTriggerRatio: 0.85,
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
    },
  });

  const configPath = join(homeDir, 'config.toml');
  const text = await readFile(configPath, 'utf-8');
  for (const expected of [
    'default_model = "miki-code/miki-for-coding"',
    'default_permission_mode = "manual"',
    '[providers."managed:miki-code"]',
    '[providers."managed:miki-code".oauth]',
    '[models."miki-code/miki-for-coding"]',
    '[services.mymoon_search]',
  ]) {
    if (!text.includes(expected)) {
      throw new Error(`missing ${expected} in written config`);
    }
  }

  const reloaded = await harness.getConfig({ reload: true });
  if (reloaded.defaultModel !== 'miki-code/miki-for-coding') {
    throw new Error('reloaded config did not preserve defaultModel');
  }
  if (reloaded.providers['managed:miki-code']?.oauth?.key !== 'oauth/miki-code') {
    throw new Error('reloaded config did not preserve provider oauth');
  }

  process.stdout.write(`config: ${configPath}\n`);
  process.stdout.write('ok\n');
}

try {
  await main();
} catch (error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
