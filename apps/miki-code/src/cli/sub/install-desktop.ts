import type { Command } from 'commander';

import { mikiCodeOfficialInstallUrl } from '#/constant/app';
import { openUrl } from '#/utils/open-url';

function openDesktopAppPage(): void {
  const url = mikiCodeOfficialInstallUrl();
  process.stdout.write(`${url}\n`);
  openUrl(url);
}

export function registerInstallDesktopCommand(program: Command): void {
  program
    .command('install-desktop')
    .description('Print the Miki Code desktop app page and open it in your browser.')
    .action(openDesktopAppPage);

  program.command('install-app', { hidden: true }).action(openDesktopAppPage);
}
