import { resolve } from 'node:path';
import type { Command } from 'commander';

import { openUrl } from '#/utils/open-url';

export function registerAppCommand(program: Command): void {
  program
    .command('app [path]')
    .description('Open a new chat in the Miki Code desktop app for this directory.')
    .action((path?: string) => {
      const root = resolve(path ?? process.cwd());
      openUrl(`miki-code://open?root=${encodeURIComponent(root)}&new=1`, () => {
        process.stderr.write('Could not open Miki Code desktop. Run `miki install-desktop` to install it.\n');
        process.exitCode = 1;
      });
    });
}
