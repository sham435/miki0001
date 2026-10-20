import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_MIKI_CODE_OAUTH_HOST } from '#/constants';
import { MIKI_CODE_OAUTH_KEY } from '#/managed-miki-code';
import { DEFAULT_MIKI_CODE_BASE_URL } from '#/managed-usage';
import {
  MIKI_REGION_MARKER_FILENAME,
  MIKI_REGION_PROFILES,
  mikiRegionLoginHosts,
  mikiRegionProfile,
  mikiRegionSchema,
  resolveMikiRegion,
  resolveMikiRemoteControlAuth,
} from '#/region';

import { createTempWorkDir, type TempDirHandle } from './helpers';

describe('MIKI_REGION_PROFILES', () => {
  it('keeps the mainland-cn profile aligned with the shared defaults', () => {
    expect(MIKI_REGION_PROFILES['mainland-cn'].oauthHost).toBe(DEFAULT_MIKI_CODE_OAUTH_HOST);
    expect(MIKI_REGION_PROFILES['mainland-cn'].baseUrl).toBe(DEFAULT_MIKI_CODE_BASE_URL);
    expect(MIKI_REGION_PROFILES['mainland-cn'].relayOrigin).toBe('https://code-rc.miki.com');
  });

  it('mikiRegionProfile returns the requested profile', () => {
    expect(mikiRegionProfile('global').oauthHost).toBe('https://auth.miki.ai');
    expect(mikiRegionProfile('global').relayOrigin).toBe('https://code-rc.miki.ai');
    expect(mikiRegionProfile('global').telemetryEndpoint).toBeUndefined();
    expect(mikiRegionProfile('mainland-cn').telemetryEndpoint).toBe(
      'https://telemetry-logs.miki.com/v1/event',
    );
    expect(mikiRegionProfile('mainland-cn')).toBe(MIKI_REGION_PROFILES['mainland-cn']);
  });
});

describe('resolveMikiRegion', () => {
  let workDir: TempDirHandle | undefined;

  afterEach(async () => {
    await workDir?.cleanup();
    workDir = undefined;
  });

  async function markerDir(contents?: string): Promise<string> {
    workDir = await createTempWorkDir();
    if (contents !== undefined) {
      await writeFile(join(workDir.path, MIKI_REGION_MARKER_FILENAME), contents, 'utf-8');
    }
    return workDir.path;
  }

  it('defaults to mainland-cn when nothing points anywhere', async () => {
    expect(resolveMikiRegion({ env: {}, homeDir: await markerDir() })).toBe('mainland-cn');
  });

  it('resolves a known env oauth host, MIKI_CODE_OAUTH_HOST first', () => {
    expect(resolveMikiRegion({ env: { MIKI_CODE_OAUTH_HOST: 'https://auth.miki.ai' } })).toBe(
      'global',
    );
    expect(resolveMikiRegion({ env: { MIKI_OAUTH_HOST: 'https://auth.miki.ai' } })).toBe(
      'global',
    );
    expect(
      resolveMikiRegion({
        env: {
          MIKI_CODE_OAUTH_HOST: 'https://auth.miki.com',
          MIKI_OAUTH_HOST: 'https://auth.miki.ai',
        },
      }),
    ).toBe('mainland-cn');
  });

  it('treats an unknown env host as a custom environment and falls back to cn', async () => {
    // ...even when the persisted login or marker says otherwise: the custom
    // env overrides every endpoint anyway.
    expect(
      resolveMikiRegion({
        env: { MIKI_CODE_OAUTH_HOST: 'https://auth.internal.example.com' },
        configuredOAuthHost: 'https://auth.miki.ai',
        homeDir: await markerDir('global\n'),
      }),
    ).toBe('mainland-cn');
  });

  it('resolves the persisted login host, tolerating trailing slashes', () => {
    expect(resolveMikiRegion({ env: {}, configuredOAuthHost: 'https://auth.miki.ai/' })).toBe(
      'global',
    );
    expect(resolveMikiRegion({ env: {}, configuredOAuthHost: 'https://auth.miki.com' })).toBe('mainland-cn');
  });

  it('ignores an unrecognized persisted host and continues down the chain', async () => {
    expect(
      resolveMikiRegion({
        env: {},
        configuredOAuthHost: 'https://auth.legacy.example.com',
        homeDir: await markerDir('global'),
      }),
    ).toBe('global');
  });

  it('reads the install-channel marker when nothing else decides', async () => {
    expect(resolveMikiRegion({ env: {}, homeDir: await markerDir('global\n') })).toBe('global');
    expect(resolveMikiRegion({ env: {}, homeDir: await markerDir('  mainland-cn  ') })).toBe('mainland-cn');
  });

  it('ignores a malformed or missing marker', async () => {
    expect(resolveMikiRegion({ env: {}, homeDir: await markerDir('apac') })).toBe('mainland-cn');
    expect(resolveMikiRegion({ env: {}, homeDir: await markerDir('') })).toBe('mainland-cn');
  });

  it('skips the marker entirely when readMarker is false', async () => {
    expect(
      resolveMikiRegion({ env: {}, homeDir: await markerDir('global'), readMarker: false }),
    ).toBe('mainland-cn');
  });

  it('honors MIKI_CODE_HOME when homeDir is not passed explicitly', async () => {
    const dir = await markerDir('global');
    expect(resolveMikiRegion({ env: { MIKI_CODE_HOME: dir } })).toBe('global');
  });

  it('env beats persisted login beats marker', async () => {
    const dir = await markerDir('global');
    expect(
      resolveMikiRegion({
        env: { MIKI_CODE_OAUTH_HOST: 'https://auth.miki.com' },
        configuredOAuthHost: 'https://auth.miki.ai',
        homeDir: dir,
      }),
    ).toBe('mainland-cn');
    expect(
      resolveMikiRegion({
        env: {},
        configuredOAuthHost: 'https://auth.miki.ai',
        homeDir: dir,
      }),
    ).toBe('global');
  });

  it('treats the persisted default-slot key as explicit mainland-cn, beating the marker', async () => {
    const dir = await markerDir('global');
    expect(
      resolveMikiRegion({ env: {}, configuredOAuthKey: MIKI_CODE_OAUTH_KEY, homeDir: dir }),
    ).toBe('mainland-cn');
  });

  it('still follows the marker when no key or host is persisted', async () => {
    expect(resolveMikiRegion({ env: {}, homeDir: await markerDir('global') })).toBe('global');
  });

  it('lets an unknown scoped key fall through to the marker', async () => {
    const dir = await markerDir('global');
    const key = 'oauth/miki-code-env-0123456789abcdef';
    expect(
      resolveMikiRegion({
        env: {},
        configuredOAuthKey: key,
        homeDir: dir,
      }),
    ).toBe('global');
    expect(resolveMikiRemoteControlAuth({ env: {}, configuredOAuthKey: key, homeDir: dir })).toEqual({
      region: 'global',
      oauthKey: key,
      relayOrigin: 'https://code-rc.miki.com',
    });
  });

  it('resolves a recognized persisted host before consulting the key', () => {
    expect(
      resolveMikiRegion({
        env: {},
        configuredOAuthHost: 'https://auth.miki.ai',
        configuredOAuthKey: MIKI_CODE_OAUTH_KEY,
      }),
    ).toBe('global');
    expect(
      resolveMikiRemoteControlAuth({
        env: {},
        configuredOAuthHost: 'https://auth.miki.ai',
        configuredOAuthKey: 'oauth/miki-code-env-0123456789abcdef',
      }).relayOrigin,
    ).toBe('https://code-rc.miki.ai');
  });
});

describe('mikiRegionLoginHosts', () => {
  it('returns both profile hosts, mainland-cn included (explicit beats stale config)', () => {
    expect(mikiRegionLoginHosts('mainland-cn', {})).toEqual({
      oauthHost: 'https://auth.miki.com',
      baseUrl: 'https://api.miki.com/coding/v1',
    });
    expect(mikiRegionLoginHosts('global', {})).toEqual({
      oauthHost: 'https://auth.miki.ai',
      baseUrl: 'https://api.miki.ai/coding/v1',
    });
  });

  it('yields to env overrides', () => {
    expect(mikiRegionLoginHosts('global', { MIKI_CODE_OAUTH_HOST: 'https://auth.x.com' })).toBe(
      undefined,
    );
    expect(mikiRegionLoginHosts('global', { MIKI_OAUTH_HOST: 'https://auth.x.com' })).toBe(
      undefined,
    );
    expect(
      mikiRegionLoginHosts('global', { MIKI_CODE_BASE_URL: 'https://api.x.com/coding/v1' }),
    ).toBe(undefined);
  });
});

describe('mikiRegionSchema', () => {
  it('parses valid regions and rejects others', () => {
    expect(mikiRegionSchema.parse('mainland-cn')).toBe('mainland-cn');
    expect(mikiRegionSchema.parse('global')).toBe('global');
    expect(mikiRegionSchema.safeParse('apac').success).toBe(false);
  });
});
