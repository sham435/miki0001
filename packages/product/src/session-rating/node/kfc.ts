import { isManagedMikiCodeBaseUrl } from '@mymoon-ai/miki-code-oauth';

export interface RatingModelRoute {
  readonly modelId: string | undefined;
  readonly baseUrl: string | undefined;
}

export function kfcModelIdOf(route: RatingModelRoute): string | undefined {
  if (route.modelId === undefined || !isManagedMikiCodeBaseUrl(route.baseUrl)) return undefined;
  return route.modelId;
}
