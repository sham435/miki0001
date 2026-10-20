import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isConfigStubOrMissing, isTuiStubOrMissing } from '../src/stub-detect.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'stub-detect-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('isConfigStubOrMissing', () => {
  it('returns true when config.toml is missing', async () => {
    expect(await isConfigStubOrMissing(join(dir, 'config.toml'))).toBe(true);
  });

  it('returns true when content matches DEFAULT_CONFIG_FILE_TEXT exactly', async () => {
    // From packages/miki-core/src/harness/configs/toml.ts:42
    const stub =
      '# ~/.miki-code/config.toml\n' +
      '# Runtime settings for Miki Code.\n' +
      '# This file starts empty so built-in defaults can apply.\n' +
      '# Login will populate managed Miki provider and model entries.\n';
    await writeFile(join(dir, 'config.toml'), stub, 'utf-8');
    expect(await isConfigStubOrMissing(join(dir, 'config.toml'))).toBe(true);
  });

  it('returns false when user added a single non-comment line', async () => {
    const modified =
      '# ~/.miki-code/config.toml\n' +
      '# Runtime settings for Miki Code.\n' +
      '# This file starts empty so built-in defaults can apply.\n' +
      '# Login will populate managed Miki provider and model entries.\n' +
      'default_thinking = true\n';
    await writeFile(join(dir, 'config.toml'), modified, 'utf-8');
    expect(await isConfigStubOrMissing(join(dir, 'config.toml'))).toBe(false);
  });

  it('returns false on any byte difference, even trailing whitespace', async () => {
    const stubPlusSpace =
      '# ~/.miki-code/config.toml\n' +
      '# Runtime settings for Miki Code.\n' +
      '# This file starts empty so built-in defaults can apply.\n' +
      '# Login will populate managed Miki provider and model entries.\n' +
      ' ';
    await writeFile(join(dir, 'config.toml'), stubPlusSpace, 'utf-8');
    expect(await isConfigStubOrMissing(join(dir, 'config.toml'))).toBe(false);
  });
});

describe('isTuiStubOrMissing', () => {
  it('returns true when tui.toml is missing', async () => {
    expect(await isTuiStubOrMissing(join(dir, 'tui.toml'))).toBe(true);
  });

  it('returns true when content is byte-equal to default render', async () => {
    const defaultRender =
      '# ~/.miki-code/tui.toml\n' +
      '# Terminal UI preferences for miki-code.\n' +
      '# Agent/runtime settings stay in ~/.miki-code/config.toml.\n' +
      '\n' +
      'theme = "auto" # "auto" | "dark" | "light"\n' +
      '\n' +
      '[editor]\n' +
      'command = "" # Empty uses $VISUAL / $EDITOR\n' +
      '\n' +
      '[notifications]\n' +
      'enabled = true # true | false\n' +
      'notification_condition = "unfocused" # "unfocused" | "always"\n';
    await writeFile(join(dir, 'tui.toml'), defaultRender, 'utf-8');
    expect(await isTuiStubOrMissing(join(dir, 'tui.toml'))).toBe(true);
  });

  it('returns true when fields semantically equal default (even after parse round-trip)', async () => {
    // User loaded the file in an editor; their editor stripped trailing whitespace
    // or rewrote with different formatting but same fields.
    const reformatted =
      'theme = "auto"\n[editor]\ncommand = ""\n[notifications]\nenabled = true\nnotification_condition = "unfocused"\n';
    await writeFile(join(dir, 'tui.toml'), reformatted, 'utf-8');
    expect(await isTuiStubOrMissing(join(dir, 'tui.toml'))).toBe(true);
  });

  it('returns false when theme is changed', async () => {
    const modified =
      'theme = "dark"\n[editor]\ncommand = ""\n[notifications]\nenabled = true\nnotification_condition = "unfocused"\n';
    await writeFile(join(dir, 'tui.toml'), modified, 'utf-8');
    expect(await isTuiStubOrMissing(join(dir, 'tui.toml'))).toBe(false);
  });
});
