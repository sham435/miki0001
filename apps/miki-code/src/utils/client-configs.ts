import { join } from 'node:path';

import { ClientConfigClient } from '@mymoon-ai/miki-code-product/client-configs/node';

import { getCacheDir } from '#/utils/paths';
import { currentMikiRegion } from '#/utils/region';

export const clientConfigs = new ClientConfigClient({
  region: currentMikiRegion,
  baseUrlOverride: () => process.env['MIKI_CODE_BASE_URL'],
  cacheDir: () => join(getCacheDir(), 'client-configs'),
});
