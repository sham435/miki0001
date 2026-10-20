import * as vscode from "vscode";

import {
  createMikiDeviceId,
  MIKI_CODE_PROVIDER_NAME,
  MIKI_REGION_PROFILES,
  resolveMikiRegion,
} from "@mymoon-ai/miki-code-oauth";
import {
  MikiAuthFacade,
  loadRuntimeConfigSafe,
  resolveConfigPath,
  resolveMikiHome,
  type MikiConfig,
} from "@mymoon-ai/miki-code-sdk";
import {
  initializeTelemetry,
  setTelemetryEnabled,
  shouldEnableTelemetry,
  shutdownTelemetry,
  track,
} from "@mymoon-ai/miki-telemetry";

const SHUTDOWN_TIMEOUT_MS = 2000;

export interface ExtensionTelemetryOptions {
  readonly version: string;
  readonly log: (message: string) => void;
}

export function activateExtensionTelemetry(options: ExtensionTelemetryOptions): vscode.Disposable {
  const homeDir = resolveMikiHome();
  let firstLaunch = false;
  const deviceId = createMikiDeviceId(homeDir, {
    onFirstLaunch: () => {
      firstLaunch = true;
    },
  });
  const configPath = resolveConfigPath({ homeDir });
  const config = readTelemetryConfig(configPath);
  const auth = new MikiAuthFacade({ homeDir, configPath });

  initializeTelemetry({
    homeDir,
    deviceId,
    enabled: config.telemetry !== false,
    initiallyEnabled: vscode.env.isTelemetryEnabled,
    appName: "miki-code-vscode",
    version: options.version,
    uiMode: "vscode",
    model: config.defaultModel,
    endpoint: () => telemetryEndpoint(homeDir),
    getAccessToken: async () => (await auth.getCachedAccessToken(MIKI_CODE_PROVIDER_NAME)) ?? null,
    onUnexpectedError: (error) => options.log(`Telemetry dropped a property: ${error.message}`),
  });

  const staticallyEnabled = shouldEnableTelemetry({ enabled: config.telemetry !== false });
  if (firstLaunch) track("first_launch");

  return vscode.env.onDidChangeTelemetryEnabled((enabled) => {
    if (staticallyEnabled) setTelemetryEnabled(enabled);
  });
}

export async function deactivateExtensionTelemetry(): Promise<void> {
  await shutdownTelemetry({ timeoutMs: SHUTDOWN_TIMEOUT_MS });
}

function readTelemetryConfig(
  configPath: string,
): Pick<MikiConfig, "telemetry" | "defaultModel"> {
  try {
    const { config, fileError } = loadRuntimeConfigSafe(configPath);
    if (fileError !== undefined) return {};
    return config;
  } catch {
    return {};
  }
}

function telemetryEndpoint(homeDir: string): string | undefined {
  const oauth = loadRuntimeConfigSafe(resolveConfigPath({ homeDir })).config.providers?.[
    MIKI_CODE_PROVIDER_NAME
  ]?.oauth;
  const region = resolveMikiRegion({
    configuredOAuthHost: oauth?.oauthHost,
    configuredOAuthKey: oauth?.key,
    homeDir,
    readMarker: process.env["MIKI_CODE_REGION_MARKER"] !== "off",
  });
  return MIKI_REGION_PROFILES[region].telemetryEndpoint;
}
