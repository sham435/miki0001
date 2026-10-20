import { ErrorCodes, type HostUiCapability } from '@mymoon-ai/miki-code-sdk';

import { currentMikiProfile } from '#/utils/region';

export const PRODUCT_NAME = 'Miki Code';
export const CLI_COMMAND_NAME = 'miki';
export const PROCESS_NAME = 'miki-code';

// Used in telemetry app names and HTTP User-Agent headers.
export const CLI_USER_AGENT_PRODUCT = 'miki-code-cli';
export const CLI_MSH_PLATFORM = 'miki_code_cli';
export const CLI_UI_MODE = 'shell';
// UI surfaces the TUI renders; declared to the engine at bootstrap so features that need a
// host-side surface (the NotifyUser update panel) are offered to this process only.
export const TUI_HOST_UI_CAPABILITIES: readonly HostUiCapability[] = ['update_panel'];
// Telemetry ui_mode for the `miki web` host. Same product
// as the CLI (CLI_USER_AGENT_PRODUCT); the surface is distinguished by ui_mode.
export const WEB_UI_MODE = 'web';
// User-Agent suffix for the `miki web` host: its requests go out as
// `miki-code-cli/<version> (web)` so upstream can tell web-UI traffic
// apart from direct CLI runs without changing the product token or platform.
export const WEB_USER_AGENT_SUFFIX = 'web';

// Give telemetry a short flush window without making CLI exit feel stuck.
export const CLI_SHUTDOWN_TIMEOUT_MS = 3000;

// Upper bound on headless (`miki -p`) shutdown. A wedged cleanup step (e.g. a
// SessionEnd hook, an MCP shutdown, or a connection blackholed by a restrictive
// firewall) must not keep a completed run alive indefinitely — once this elapses
// we stop waiting on cleanup and let the run return.
export const PROMPT_CLEANUP_TIMEOUT_MS = 8000;

// Grace after a headless run has fully completed (turn done, cleanup attempted)
// before force-exiting. `miki -p` otherwise relies on the event loop draining to
// exit; a stray ref'd handle (socket/timer/child) left over from the run would
// wedge it. The guard timer is unref'd, so a healthy run still exits naturally
// well before this fires.
export const HEADLESS_FORCE_EXIT_GRACE_MS = 2000;

// Max time to wait for buffered stdout/stderr to flush before arming the
// force-exit fallback. A slow/piped consumer's still-draining stdio is a
// legitimate ref'd handle — flushing first prevents the fallback from
// truncating completed output. Bounded so a permanently-stuck consumer can't
// re-introduce the hang.
export const HEADLESS_STDIO_DRAIN_TIMEOUT_MS = 10000;

// Published npm package name; this can differ from the executable command.
export const NPM_PACKAGE_NAME = '@mymoon-ai/miki-code';

// App-owned data paths. SDK/core runtime config is intentionally not routed here.
export const MIKI_CODE_HOME_ENV = 'MIKI_CODE_HOME';
export const MIKI_CODE_DATA_DIR_NAME = '.miki-code';
export const MIKI_CODE_LOG_DIR_NAME = 'logs';
export const MIKI_CODE_CACHE_DIR_NAME = 'cache';
export const MIKI_CODE_UPDATE_DIR_NAME = 'updates';
export const MIKI_CODE_BIN_DIR_NAME = 'bin';
export const MIKI_CODE_UPDATE_STATE_FILE_NAME = 'latest.json';
export const MIKI_CODE_UPDATE_INSTALL_STATE_FILE_NAME = 'install.json';
export const MIKI_CODE_UPDATE_INSTALL_LOCK_FILE_NAME = 'install.lock';
export const MIKI_CODE_UPDATE_ROLLOUT_LOG_FILE_NAME = 'rollout.log';
export const MIKI_CODE_PLUGIN_UPDATE_NOTICE_STATE_FILE_NAME = 'plugin-notices.json';
// Native staged update: the staged binary + metadata live next to the running
// executable (`<exe dir>/.staging/`); the re-exec guard env breaks the
// swap → re-exec → swap loop.
export const MIKI_CODE_NATIVE_STAGING_DIR_NAME = '.staging';
export const MIKI_CODE_NATIVE_STAGED_STATE_FILE_NAME = 'staged.json';
export const MIKI_CODE_UPDATE_REEXEC_ENV = 'MIKI_CODE_UPDATE_REEXEC';
export const MIKI_CODE_INPUT_HISTORY_DIR_NAME = 'user-history';
export const MIKI_CODE_BANNER_DIR_NAME = 'banner';
export const MIKI_CODE_BANNER_STATE_FILE_NAME = 'state.json';
export const MIKI_CODE_RECOMMENDED_EFFORT_STATE_FILE_NAME = 'recommended-effort-state.json';
export const MIKI_CODE_MODEL_MIGRATION_STATE_FILE_NAME = 'model-migrations.json';

// Managed Miki auth provider key shared with OAuth/SDK config.
export const DEFAULT_OAUTH_PROVIDER_NAME = 'managed:miki-code';

// SDK/core error code that tells the TUI to show a login-required startup
// notice. Derived from sdk's ErrorCodes so a future rename in core
// auto-propagates instead of silently breaking the startup recovery path.
export const OAUTH_LOGIN_REQUIRED_CODE = ErrorCodes.AUTH_LOGIN_REQUIRED;

export const FEEDBACK_ISSUE_URL = 'https://github.com/MymoonAI/miki-code/issues';
// Sign-up / sign-in page offered to signed-out users so they can create an
// account and submit feedback through the authenticated channel next time.
export function mikiCodeSignupUrl(): string {
  return `${currentMikiProfile().siteBase}/code`;
}

// Sent in the feedback `version` field so the backend can distinguish this
// TypeScript client from clients that send a bare version.
export const FEEDBACK_VERSION_PREFIX = 'miki-code-';

// Telemetry event name; keep stable for dashboard queries.
export const FEEDBACK_TELEMETRY_EVENT = 'feedback_submitted';

// CDN source of truth: all version checks and native install scripts pull from here.
// The off-session endpoints derive from the current region profile so a
// global login points at the .ai deployment; they are resolved per call so
// a region switch (login/logout + refreshMikiRegion) takes effect immediately.
export function mikiCodeCdnBase(): string {
  return currentMikiProfile().cdnBase;
}
export function mikiCodeCdnLatestUrl(): string {
  return `${mikiCodeCdnBase()}/latest`;
}
// Rollout manifest consumed by update checks; the plain-text `/latest` above
// stays unchanged forever — already-shipped clients hard-fail on non-semver
// bodies, and the CDN install scripts read it for fresh installs.
export function mikiCodeCdnLatestJsonUrl(): string {
  return `${mikiCodeCdnBase()}/latest.json`;
}
// Per-release native artifacts: `/binaries/<version>/manifest.json` +
// `/binaries/<version>/miki-code-<target>[.exe]` — the bare platform binary
// (same layout install.ps1 consumes).
export function mikiCodeCdnBinariesBase(): string {
  return `${mikiCodeCdnBase()}/binaries`;
}
// The marketplace env override name lives in the shared agent-core-v2 plugin
// domain (kap-server consumes it from there). Deep-path import: this module is
// evaluated on every CLI invocation, so it must not pull in the engine root.
export { MIKI_CODE_PLUGIN_MARKETPLACE_URL_ENV } from '@mymoon-ai/agent-core-v2/app/plugin/marketplace';
// The CLI-side default catalog derives from the current region profile; the
// env override above takes priority at the call site.
export function mikiCodePluginMarketplaceUrl(): string {
  return `${mikiCodeCdnBase()}/plugins/marketplace.json`;
}
// Bound on each background "latest release" lookup when the TUI fills in
// marketplace versions. Without it a stalled connection to github.com hangs
// the version phase for undici's default header timeout (300s).
export const MARKETPLACE_VERSION_LOOKUP_TIMEOUT_MS = 5000;
export const INTERACTIVE_UPDATE_CHECK_TIMEOUT_MS = 10_000;
// Official plugins whose usage bills against the user's plan quota. Installing
// one of these shows a quota note after the install result.
export const QUOTA_CONSUMING_PLUGIN_IDS: readonly string[] = ['miki-datasource'];
export function mikiCodeInstallShUrl(): string {
  return `${mikiCodeCdnBase()}/install.sh`;
}
export function mikiCodeInstallPs1Url(): string {
  return `${mikiCodeCdnBase()}/install.ps1`;
}
// Official download page, referenced by prompt copy that steers users away
// from third-party install sources.
export function mikiCodeOfficialInstallUrl(): string {
  return `${currentMikiProfile().siteBase}/code`;
}

// Native install commands, split by platform. Use these for prompt copy and spawn calls only; do not assemble the strings elsewhere.
export function nativeInstallCommandUnix(): string {
  return `curl -fsSL ${mikiCodeInstallShUrl()} | bash`;
}
export function nativeInstallCommandWin(): string {
  return `irm ${mikiCodeInstallPs1Url()} | iex`;
}
