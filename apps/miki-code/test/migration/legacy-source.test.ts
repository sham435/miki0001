import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { resolveLegacySourceHome, sameLegacyPath } from '#/migration/legacy-source';

const HOME = '/home/user';
const CWD = '/work/project';

describe('resolveLegacySourceHome', () => {
  it('defaults to ~/.miki when MIKI_SHARE_DIR is unset', () => {
    const r = resolveLegacySourceHome({}, HOME, CWD);
    expect(r).toEqual({ sourceHome: join(HOME, '.miki'), origin: 'default' });
  });

  it('defaults to ~/.miki when MIKI_SHARE_DIR is empty or blank', () => {
    expect(resolveLegacySourceHome({ MIKI_SHARE_DIR: '' }, HOME, CWD).origin).toBe('default');
    expect(resolveLegacySourceHome({ MIKI_SHARE_DIR: '   ' }, HOME, CWD).origin).toBe('default');
  });

  it('uses an absolute MIKI_SHARE_DIR verbatim', () => {
    const r = resolveLegacySourceHome({ MIKI_SHARE_DIR: '/data/miki' }, HOME, CWD);
    expect(r.sourceHome).toBe('/data/miki');
    expect(r.origin).toBe('share-dir');
  });

  it('resolves a relative MIKI_SHARE_DIR against the process CWD (old-CLI rule)', () => {
    const r = resolveLegacySourceHome({ MIKI_SHARE_DIR: 'relative/miki' }, HOME, CWD);
    expect(r.sourceHome).toBe(join(CWD, 'relative', 'miki'));
    expect(r.origin).toBe('share-dir');
  });

  it('does not expand ~ in MIKI_SHARE_DIR (old-CLI rule)', () => {
    const r = resolveLegacySourceHome({ MIKI_SHARE_DIR: '~/custom' }, HOME, CWD);
    expect(r.sourceHome).toBe(join(CWD, '~/custom'));
  });

  it('resolves skills from ~/.miki when the share dir is redirected', () => {
    const r = resolveLegacySourceHome({ MIKI_SHARE_DIR: '/data/miki' }, HOME, CWD);
    expect(r.skillsSourceHome).toBe(join(HOME, '.miki'));
  });

  it('keeps a single source when MIKI_SHARE_DIR points at ~/.miki itself', () => {
    const r = resolveLegacySourceHome({ MIKI_SHARE_DIR: join(HOME, '.miki') }, HOME, CWD);
    expect(r.skillsSourceHome).toBeUndefined();
  });
});

describe('sameLegacyPath', () => {
  it('matches identical and redundant forms', () => {
    expect(sameLegacyPath('/a/b', '/a/b')).toBe(true);
    expect(sameLegacyPath('/a/b/', '/a/b')).toBe(true);
    expect(sameLegacyPath('/a/./b', '/a/b')).toBe(true);
  });

  it('rejects different paths', () => {
    expect(sameLegacyPath('/a/b', '/a/c')).toBe(false);
  });
});
