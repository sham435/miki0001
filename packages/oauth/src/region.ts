/**
 * Region profiles for the mainland-China (.com) and global (.ai)
 * Miki Code deployments, plus the resolver that decides which region a
 * client belongs to.
 *
 * A region is a bundle of endpoints (OAuth host, managed API base URL, CDN,
 * site, Remote Control relay, and telemetry when that region's collector is
 * live). The OAuth client_id is shared across regions and stays in
 * `./constants`.
 *
 * Resolution order (first match wins):
 *   1. env override (`MIKI_CODE_OAUTH_HOST` / `MIKI_OAUTH_HOST`)
 *   2. persisted login (the `oauthHost` stored in config.toml's oauth ref)
 *   3. persisted default-slot login (the oauth ref's key equals
 *      `MIKI_CODE_OAUTH_KEY` — a mainland-China login persists no
 *      `oauthHost`, so the default slot's presence is an explicit-mainland-cn
 *      signal that outranks the marker)
 *   4. install-channel marker file (`<home>/region`, written by install
 *      scripts; consultable only before the first login)
 *   5. default 'mainland-cn'
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import { DEFAULT_MIKI_CODE_OAUTH_HOST } from './constants';
import { DEFAULT_MIKI_CODE_BASE_URL } from './managed-usage';
import {
  mikiCodeEnvBaseUrl,
  mikiCodeEnvOAuthHost,
  MIKI_CODE_OAUTH_KEY,
  resolveMikiCodeOAuthRef,
} from './managed-miki-code';

export type MikiRegion = 'mainland-cn' | 'global';

/** Zod schema for the wire/domain contract; parses to {@link MikiRegion}. */
export const mikiRegionSchema = z.enum(['mainland-cn', 'global']);

export interface MikiRegionProfile {
  /** OAuth host the device flow talks to (authorize/token derive from it). */
  readonly oauthHost: string;
  /** Managed API base (`/coding/v1`): usages, userinfo, models, feedback... */
  readonly baseUrl: string;
  /** Update/install/plugin-marketplace root. */
  readonly cdnBase: string;
  /** Official site root (docs, console, signup, upgrade pages). */
  readonly siteBase: string;
  /**
   * Cloud telemetry collector. Absent when that collector is not live; callers
   * must skip the send instead of falling back to another region's host.
   */
  readonly telemetryEndpoint?: string;
  /** Remote Control relay origin (`miki rc` / `/web` public URL). */
  readonly relayOrigin: string;
}

export const MIKI_REGION_PROFILES: Record<MikiRegion, MikiRegionProfile> = {
  'mainland-cn': {
    oauthHost: DEFAULT_MIKI_CODE_OAUTH_HOST,
    baseUrl: DEFAULT_MIKI_CODE_BASE_URL,
    cdnBase: 'https://code.miki.com/miki-code',
    siteBase: 'https://www.miki.com',
    telemetryEndpoint: 'https://telemetry-logs.miki.com/v1/event',
    relayOrigin: 'https://code-rc.miki.com',
  },
  global: {
    oauthHost: 'https://auth.miki.ai',
    baseUrl: 'https://api.miki.ai/coding/v1',
    cdnBase: 'https://code.miki.ai/miki-code',
    siteBase: 'https://www.miki.ai',
    relayOrigin: 'https://code-rc.miki.ai',
  },
};

export function mikiRegionProfile(region: MikiRegion): MikiRegionProfile {
  return MIKI_REGION_PROFILES[region];
}

/**
 * Content-CDN URL builder (tips banner, WebBridge / Computer-Use binaries).
 * International mirror coverage of cdn.miki.ai for these payloads is still
 * being confirmed, so both regions currently share the .com host — funnel
 * every content URL through here so flipping later touches one function.
 */
export function mikiCdnContentUrl(path: string): string {
  return `https://cdn.miki.com/${path.replace(/^\/+/, '')}`;
}

/**
 * Login hosts for an explicit region choice, or `undefined` when an env
 * override (`MIKI_CODE_OAUTH_HOST` / `MIKI_OAUTH_HOST` / `MIKI_CODE_BASE_URL`)
 * is in play — env keeps full control of endpoints, so a region pick must not
 * smuggle profile hosts past it (requested hosts outrank env in
 * `resolveMikiCodeLoginAuth`).
 *
 * When returned, both hosts are always set — including for 'mainland-cn',
 * whose values equal the defaults. Passing them explicitly is what lets
 * "switch back to mainland China" override a previously persisted global
 * login in config.toml.
 */
export function mikiRegionLoginHosts(
  region: MikiRegion,
  env: NodeJS.ProcessEnv = process.env,
): { readonly oauthHost: string; readonly baseUrl: string } | undefined {
  if (mikiCodeEnvOAuthHost(env) !== undefined || mikiCodeEnvBaseUrl(env) !== undefined) {
    return undefined;
  }
  const profile = mikiRegionProfile(region);
  return { oauthHost: profile.oauthHost, baseUrl: profile.baseUrl };
}

/**
 * Marker file name under the Miki home dir. Install scripts write a single
 * line (`mainland-cn` or `global`) here so a fresh client can default to the
 * region matching the channel it was installed from. It is only consulted
 * while the user has never logged in; a persisted login (config.toml) always
 * wins.
 */
export const MIKI_REGION_MARKER_FILENAME = 'region';

export interface ResolveMikiRegionOptions {
  /** Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /** The `oauthHost` persisted in config.toml's oauth ref, if any. */
  readonly configuredOAuthHost?: string;
  /**
   * The credential key persisted in config.toml's oauth ref, if any. The
   * default slot ({@link MIKI_CODE_OAUTH_KEY}) only ever holds a
   * mainland-China login — mainland-cn persists no `oauthHost` — so its
   * presence is an explicit-mainland-cn signal that outranks the
   * install-channel marker.
   */
  readonly configuredOAuthKey?: string;
  /** Miki home dir; defaults to `MIKI_CODE_HOME` or `~/.miki-code`. */
  readonly homeDir?: string;
  /**
   * Set false to skip the install-channel marker (e.g. the desktop app's
   * embedded server, which is not installed through a channel script and
   * leaves the region choice entirely to the login UI).
   */
  readonly readMarker?: boolean;
}

function normalizeHost(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function regionForOAuthHost(oauthHost: string): MikiRegion | undefined {
  const normalized = normalizeHost(oauthHost);
  for (const region of Object.keys(MIKI_REGION_PROFILES) as MikiRegion[]) {
    if (normalizeHost(MIKI_REGION_PROFILES[region].oauthHost) === normalized) return region;
  }
  return undefined;
}

function readRegionMarker(homeDir: string): MikiRegion | undefined {
  let raw: string;
  try {
    raw = readFileSync(join(homeDir, MIKI_REGION_MARKER_FILENAME), 'utf-8');
  } catch {
    return undefined;
  }
  const value = raw.trim();
  return value === 'mainland-cn' || value === 'global' ? value : undefined;
}

// Mirrors `defaultMikiHome` in ./toolkit; keep the two in sync so the marker
// always lands next to the credentials dir it describes.
function defaultHomeDir(env: NodeJS.ProcessEnv): string {
  const override = env['MIKI_CODE_HOME'];
  if (override !== undefined && override.length > 0) return override;
  return join(homedir(), '.miki-code');
}

export function resolveMikiRegion(options: ResolveMikiRegionOptions = {}): MikiRegion {
  const env = options.env ?? process.env;
  // An env host that matches a profile pins the region. An unknown env host
  // means a custom/internal environment: the per-endpoint env overrides keep
  // doing their job regardless of region, so skip straight to the default
  // instead of letting a stale config/marker point CDN links somewhere odd.
  const envHost = env['MIKI_CODE_OAUTH_HOST'] ?? env['MIKI_OAUTH_HOST'];
  if (envHost !== undefined && envHost.length > 0) {
    return regionForOAuthHost(envHost) ?? 'mainland-cn';
  }
  const configured = options.configuredOAuthHost;
  if (configured !== undefined && configured.length > 0) {
    const configuredRegion = regionForOAuthHost(configured);
    if (configuredRegion !== undefined) return configuredRegion;
  }
  if (options.configuredOAuthKey === MIKI_CODE_OAUTH_KEY) return 'mainland-cn';
  if (options.readMarker !== false) {
    const markerRegion = readRegionMarker(options.homeDir ?? defaultHomeDir(env));
    if (markerRegion !== undefined) return markerRegion;
  }
  return 'mainland-cn';
}

export interface MikiRemoteControlAuth {
  readonly region: MikiRegion;
  readonly oauthKey: string;
  readonly relayOrigin: string;
}

/**
 * One region judgment for Remote Control: credential slot + relay origin.
 *
 * `oauthKey` is the persisted login slot when `configuredOAuthKey` is set
 * (including custom `miki-code-env-*` environments); otherwise the official
 * slot for the resolved region. `relayOrigin` follows the resolved region
 * profile, except that a custom-env login — a scoped slot outside the two
 * official ones, without a recognized `configuredOAuthHost` — keeps the
 * mainland relay: an install-channel marker must not flip a custom
 * environment to `.ai`.
 */
export function resolveMikiRemoteControlAuth(
  options: ResolveMikiRegionOptions = {},
): MikiRemoteControlAuth {
  const region = resolveMikiRegion(options);
  const profile = mikiRegionProfile(region);
  const configuredKey = options.configuredOAuthKey;
  const customSlot =
    configuredKey !== undefined &&
    configuredKey !== MIKI_CODE_OAUTH_KEY &&
    configuredKey !==
      resolveMikiCodeOAuthRef({
        oauthHost: MIKI_REGION_PROFILES.global.oauthHost,
        baseUrl: MIKI_REGION_PROFILES.global.baseUrl,
      }).key;
  const hostPinned =
    options.configuredOAuthHost !== undefined &&
    regionForOAuthHost(options.configuredOAuthHost) !== undefined;
  return {
    region,
    oauthKey:
      configuredKey ??
      resolveMikiCodeOAuthRef({
        oauthHost: profile.oauthHost,
        baseUrl: profile.baseUrl,
      }).key,
    relayOrigin:
      customSlot && !hostPinned
        ? MIKI_REGION_PROFILES['mainland-cn'].relayOrigin
        : profile.relayOrigin,
  };
}
