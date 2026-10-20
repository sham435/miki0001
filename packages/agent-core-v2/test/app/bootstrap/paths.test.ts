import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ensureMikiHome, resolveConfigPath, resolveMikiHome } from '#/app/bootstrap/bootstrap';

describe('bootstrap path helpers', () => {
  describe('resolveMikiHome', () => {
    it('uses explicit homeDir when provided', () => {
      expect(resolveMikiHome('/tmp/miki')).toBe('/tmp/miki');
    });

    it('falls back to MIKI_CODE_HOME env', () => {
      const prev = process.env['MIKI_CODE_HOME'];
      process.env['MIKI_CODE_HOME'] = '/env/miki';
      try {
        expect(resolveMikiHome()).toBe('/env/miki');
      } finally {
        if (prev === undefined) delete process.env['MIKI_CODE_HOME'];
        else process.env['MIKI_CODE_HOME'] = prev;
      }
    });
  });

  describe('resolveConfigPath', () => {
    it('uses explicit configPath when provided', () => {
      expect(resolveConfigPath({ configPath: '/x/config.toml' })).toBe('/x/config.toml');
    });

    it('joins homeDir with config.toml', () => {
      expect(resolveConfigPath({ homeDir: '/tmp/miki' })).toBe('/tmp/miki/config.toml');
    });
  });

  describe('ensureMikiHome', () => {
    let dir: string | undefined;
    afterEach(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    it('creates the directory with 0700 permissions', () => {
      dir = join(mkdtempSync(join(tmpdir(), 'miki-home-')), 'nested');
      ensureMikiHome(dir);
      expect(existsSync(dir)).toBe(true);
    });
  });
});
