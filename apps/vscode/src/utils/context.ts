import * as vscode from "vscode";
import type { MikiHarness } from "@mymoon-ai/miki-code-sdk";

export async function updateLoginContext(harness: MikiHarness): Promise<boolean> {
  const status = await harness.auth.status();
  const loggedIn = status.providers.some((provider) => provider.hasToken);
  await vscode.commands.executeCommand("setContext", "miki.isLoggedIn", loggedIn);
  return loggedIn;
}
