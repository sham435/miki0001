import { spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { resolveServerCommand } from './sea-path';

/** How long to keep polling `/healthz` before declaring the daemon unhealthy. */
const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_MS = 200;
const HEALTH_TIMEOUT_PER_TRY_MS = 500;

/** `<MIKI_CODE_HOME>` or `~/.miki-code` — must match the server's `resolveMikiHome`. */
export function mikiHome(): string {
  const override = process.env['MIKI_CODE_HOME'];
  if (override !== undefined && override.trim().length > 0) {
    return override;
  }
  return join(homedir(), '.miki-code');
}

/** Background daemon log written by the spawned server — surfaced in the error screen / menu. */
export function serverLogPath(): string {
  return join(mikiHome(), 'server', 'server.log');
}

/** On-disk filename of the daemon's persistent bearer token (under MIKI_CODE_HOME). */
const SERVER_TOKEN_FILE = 'server.token';

/**
 * Read the daemon's bearer token so the web UI can authenticate without showing
 * the manual token dialog on a fresh launch. Returns undefined when the token
 * cannot be read (the web UI then falls back to the dialog).
 */
export function readServerToken(): string | undefined {
  try {
    const token = readFileSync(join(mikiHome(), SERVER_TOKEN_FILE), 'utf-8').trim();
    return token.length > 0 ? token : undefined;
  } catch {
    return undefined;
  }
}

/** Ask the OS for a currently-free loopback port. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => {
        if (address !== null && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('unable to determine a free port'));
        }
      });
    });
  });
}

async function isHealthy(origin: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetch(`${origin}/api/v1/healthz`, { signal: controller.signal });
    if (!res.ok) {
      return false;
    }
    const body = (await res.json()) as { code?: unknown };
    return body.code === 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export interface EnsureServerResult {
  origin: string;
}

/**
 * Ensure a local Miki server is running and return its origin.
 *
 * The CLI runs the server in the foreground (`miki web`), so the desktop spawns
 * it as a detached background process on a free loopback port and waits for
 * `/api/v1/healthz`. The child is deliberately left running after the window
 * closes, so the CLI / browser / TUI can reuse it.
 */
export async function ensureServer(): Promise<EnsureServerResult> {
  const port = await findFreePort();
  const origin = `http://127.0.0.1:${port}`;
  const { command, args } = resolveServerCommand();

  mkdirSync(dirname(serverLogPath()), { recursive: true });
  const logFd = openSync(serverLogPath(), 'a');
  const child = spawn(
    command,
    [
      ...args,
      'web',
      '--no-open',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--log-level',
      'error',
    ],
    { detached: true, stdio: ['ignore', logFd, logFd], windowsHide: true },
  );
  child.on('error', (error) => {
    process.stderr.write(`[miki-desktop] failed to start server: ${error.message}\n`);
  });
  child.unref();

  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Miki server exited with code ${child.exitCode} before becoming healthy.`);
    }
    if (await isHealthy(origin, HEALTH_TIMEOUT_PER_TRY_MS)) {
      return { origin };
    }
    await delay(HEALTH_POLL_MS);
  }
  throw new Error(
    `Miki server at ${origin} did not become healthy within ${HEALTH_TIMEOUT_MS}ms.`,
  );
}
