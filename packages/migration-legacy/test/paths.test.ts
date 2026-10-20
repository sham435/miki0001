import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import * as paths from '../src/paths.js';

describe('paths', () => {
  it('sourceCredentialsDir joins ~/.miki/credentials', () => {
    expect(paths.sourceCredentialsDir('/x/.miki')).toBe(join('/x/.miki', 'credentials'));
  });

  it('targetConfigFile and targetTuiFile', () => {
    expect(paths.targetConfigFile('/y')).toBe(join('/y', 'config.toml'));
    expect(paths.targetTuiFile('/y')).toBe(join('/y', 'tui.toml'));
  });

  it('targetSessionIndex', () => {
    expect(paths.targetSessionIndex('/y')).toBe(join('/y', 'session_index.jsonl'));
  });

  it('migratedMarker is under source', () => {
    expect(paths.migratedMarker('/x/.miki')).toBe(join('/x/.miki', '.migrated-to-miki-code'));
  });

  it('skipMarker is under target', () => {
    expect(paths.skipMarker('/y/.miki-code')).toBe(join('/y/.miki-code', '.skip-migration-from-miki-cli'));
  });

  it('migrationReportFile is under target', () => {
    expect(paths.migrationReportFile('/y')).toBe(join('/y', 'migration-report.json'));
  });

  it('sourceSessionsDir / sourceUserHistoryDir / sourceMikiJson', () => {
    expect(paths.sourceSessionsDir('/x')).toBe(join('/x', 'sessions'));
    expect(paths.sourceUserHistoryDir('/x')).toBe(join('/x', 'user-history'));
    expect(paths.sourceMikiJson('/x')).toBe(join('/x', 'miki.json'));
  });
});
