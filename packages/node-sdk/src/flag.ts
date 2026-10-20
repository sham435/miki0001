import type {
  FlagDefinitionInput,
  FlagId,
} from '@mymoon-ai/agent-core-v2/app/flag/flagRegistry';

export type {
  ExperimentalFeatureState,
  ExperimentalFlagMap,
  ExperimentalFlagSource,
} from '@mymoon-ai/agent-core-v2/app/flag/flag';
export type {
  FlagDefinitionInput,
  FlagId,
  FlagSurface,
} from '@mymoon-ai/agent-core-v2/app/flag/flagRegistry';

export type FlagDefinition = FlagDefinitionInput & { readonly id: FlagId };
