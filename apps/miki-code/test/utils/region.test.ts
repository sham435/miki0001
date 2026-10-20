import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { currentMikiRegion, refreshMikiRegion, regionForBareLogin } from '#/utils/region';

const originalEnv = { ...process.env };

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'miki-region-test-'));
  process.env['MIKI_CODE_HOME'] = home;
  delete process.env['MIKI_CODE_OAUTH_HOST'];
  delete process.env['MIKI_OAUTH_HOST'];
  delete process.env['MIKI_CODE_REGION_MARKER'];
  refreshMikiRegion();
});

afterEach(() => {
  process.env = { ...originalEnv };
  refreshMikiRegion();
  rmSync(home, { recursive: true, force: true });
});

describe('currentMikiRegion', () => {
  it('follows the install-channel marker before the first login', () => {
    writeFileSync(join(home, 'region'), 'global\n');
    expect(refreshMikiRegion()).toBe('global');
    expect(currentMikiRegion()).toBe('global');
  });

  it('ignores the marker when MIKI_CODE_REGION_MARKER=off (embedded server)', () => {
    writeFileSync(join(home, 'region'), 'global\n');
    process.env['MIKI_CODE_REGION_MARKER'] = 'off';
    expect(refreshMikiRegion()).toBe('mainland-cn');
  });

  it('still honors a persisted global login when the marker is opted out', () => {
    writeFileSync(join(home, 'region'), 'global\n');
    writeFileSync(
      join(home, 'config.toml'),
      [
        '[providers."managed:miki-code"]',
        'type = "miki"',
        '',
        '[providers."managed:miki-code".oauth]',
        'storage = "file"',
        'key = "oauth/miki-code-env-0123456789abcdef"',
        'oauthHost = "https://auth.miki.ai"',
        '',
      ].join('\n'),
    );
    process.env['MIKI_CODE_REGION_MARKER'] = 'off';
    expect(refreshMikiRegion()).toBe('global');
  });
});

describe('regionForBareLogin', () => {
  it('follows the resolved region for a fresh install (no persisted ref)', () => {
    expect(regionForBareLogin(undefined)).toBe('mainland-cn');
    writeFileSync(join(home, 'region'), 'global\n');
    refreshMikiRegion();
    expect(regionForBareLogin(undefined)).toBe('global');
  });

  it('re-pins mainland-cn for the default slot', () => {
    expect(regionForBareLogin({ key: 'oauth/miki-code' })).toBe('mainland-cn');
  });

  it('keeps the configured environment for a scoped slot without a persisted host', () => {
    expect(regionForBareLogin({ key: 'oauth/miki-code-env-0123456789abcdef' })).toBeUndefined();
  });

  it('keeps the persisted environment for a global login', () => {
    expect(
      regionForBareLogin({
        key: 'oauth/miki-code-env-0123456789abcdef',
        oauthHost: 'https://auth.miki.ai',
      }),
    ).toBeUndefined();
  });
});
