import { isRecord } from './utils';
import type { ManagedMikiModelAlias, ManagedMikiModelAliasOverrides } from './managed-miki-code';

export const MANAGED_MIKI_MODEL_FIELDS: ReadonlySet<string> = new Set([
  'provider',
  'model',
  'maxContextSize',
  'capabilities',
  'displayName',
  'protocol',
  'betaApi',
  'adaptiveThinking',
  'supportEfforts',
  'defaultEffort',
]);

export const CUSTOM_REGISTRY_MODEL_FIELDS: ReadonlySet<string> = new Set([
  'provider',
  'model',
  'maxContextSize',
  'capabilities',
  'displayName',
  'supportEfforts',
  'defaultEffort',
  'upgrade',
]);

function cloneOverrides(
  overrides: ManagedMikiModelAliasOverrides | undefined,
): ManagedMikiModelAliasOverrides | undefined {
  if (overrides === undefined) return undefined;
  return structuredClone(overrides);
}

function userExtras(
  existing: Record<string, unknown>,
  remoteOwnedFields: ReadonlySet<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(existing)) {
    if (key === 'overrides') continue;
    if (!remoteOwnedFields.has(key)) out[key] = value;
  }
  return out;
}

export function mergeRefreshedModelAlias(
  existing: unknown,
  remote: ManagedMikiModelAlias,
  remoteOwnedFields: ReadonlySet<string>,
): ManagedMikiModelAlias {
  const current = isRecord(existing) ? existing : {};
  const overrides = cloneOverrides(
    isRecord(current['overrides'])
      ? (current['overrides'] as ManagedMikiModelAliasOverrides)
      : undefined,
  );
  return {
    ...userExtras(current, remoteOwnedFields),
    ...remote,
    ...(overrides !== undefined ? { overrides } : {}),
  };
}
