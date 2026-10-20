import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { app } from 'electron';

// The bundled backend targets the same 6 platform/arch pairs the miki-code
// native SEA build supports (apps/miki-code/scripts/native/native-deps.mjs).
const SUPPORTED_TARGETS = new Set([
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-arm64',
  'win32-x64',
]);

/** `<platform>-<arch>` triple for the current process, validated against the SEA targets. */
export function currentTarget(): string {
  const target = `${process.platform}-${process.arch}`;
  if (!SUPPORTED_TARGETS.has(target)) {
    throw new Error(`No bundled Miki server for this platform: ${target}`);
  }
  return target;
}

function executableName(): string {
  return process.platform === 'win32' ? 'miki.exe' : 'miki';
}

/** How to launch the local Miki server. */
export interface ServerCommand {
  command: string;
  args: string[];
}

/**
 * Resolve the local Miki server launcher.
 *
 * - packaged: the bundled SEA binary under `<resources>/bin/<target>/miki[.exe]`.
 * - dev: the sibling `apps/miki-code` native SEA build when present, otherwise
 *   its Node build (`dist/main.mjs`) run with the current Node executable.
 */
export function resolveServerCommand(): ServerCommand {
  if (app.isPackaged) {
    const seaPath = join(process.resourcesPath, 'bin', currentTarget(), executableName());
    if (!existsSync(seaPath)) {
      throw new Error(`Bundled Miki server not found at ${seaPath}`);
    }
    return { command: seaPath, args: [] };
  }

  const seaPath = join(
    app.getAppPath(),
    '..',
    'miki-code',
    'dist-native',
    'bin',
    currentTarget(),
    executableName(),
  );
  if (existsSync(seaPath)) {
    return { command: seaPath, args: [] };
  }

  const nodeBuild = join(app.getAppPath(), '..', 'miki-code', 'dist', 'main.mjs');
  if (existsSync(nodeBuild)) {
    return { command: process.execPath, args: [nodeBuild] };
  }

  throw new Error(
    'No local Miki server build found. Build apps/miki-code first (or run build:native:sea).',
  );
}
