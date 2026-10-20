// apps/miki-web/src/api/index.ts
// Singleton factory for the MikiWebApi daemon client.

import { readMikiApiConfig } from './config';
import type { MikiWebApi } from './types';
import { DaemonMikiWebApi } from './daemon/client';

let singleton: MikiWebApi | undefined;

export function getMikiWebApi(): MikiWebApi {
  singleton ??= new DaemonMikiWebApi(readMikiApiConfig());
  return singleton;
}
