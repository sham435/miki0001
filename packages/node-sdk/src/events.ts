import type {
  ApprovalRequest,
  ApprovalResponse,
  QuestionRequest,
  QuestionResult,
} from '#/interaction';

export type { MikiErrorPayload } from '#/errors';

export type { Event, ToolResultEvent } from '@mymoon-ai/agent-core-v2/events';

export { MCP_OAUTH_AUTHORIZATION_URL_TOOL_UPDATE } from '@mymoon-ai/agent-core-v2/tool/toolContract';

export type { AgentStatusUpdatedEvent } from '@mymoon-ai/agent-core-v2/agent/usage/usageEvents';
export type { SessionMetaUpdatedEvent } from '@mymoon-ai/agent-core-v2/session/sessionMetadata/sessionMetaEvents';
export type { GoalUpdatedEvent } from '@mymoon-ai/agent-core-v2/features/goal/goalOps';
export type { SkillActivatedEvent } from '@mymoon-ai/agent-core-v2/features/skill/skillOps';
export type { PluginCommandActivatedEvent } from '@mymoon-ai/agent-core-v2/agent/pluginCommand/pluginCommand';
export type { ErrorEvent, WarningEvent } from '@mymoon-ai/agent-core-v2/errors';
export type { UsageStatus } from '@mymoon-ai/agent-core-v2/agent/usage/usage';

export type {
  TurnStartedEvent,
  TurnStepStartedEvent,
  TurnStepCompletedEvent,
  TurnStepRetryingEvent,
  TurnStepInterruptedEvent,
  TurnEndReason,
} from '@mymoon-ai/agent-core-v2/agent/loop/turnEvents';
export type { TurnEndedEvent } from '@mymoon-ai/agent-core-v2/agent/loop/turnOps';

export type {
  AssistantDeltaEvent,
  ThinkingDeltaEvent,
} from '@mymoon-ai/agent-core-v2/agent/loop/turnEvents';

export type { HookResultEvent } from '@mymoon-ai/agent-core-v2/features/externalHooks/agent/agentExternalHooksService';

export type {
  ToolCallStartedEvent,
  ToolCallDeltaEvent,
  ToolProgressEvent,
} from '@mymoon-ai/agent-core-v2/agent/toolExecutor/toolExecutorEvents';

export type { ToolUpdate } from '@mymoon-ai/agent-core-v2/tool/toolContract';
export type { McpOAuthAuthorizationUrlUpdateData } from '@mymoon-ai/agent-core-v2/agent/mcp/tools/auth';

export type { ToolCallRequest, ToolCallResponse } from '#/interaction';

export type {
  ToolListUpdatedEvent,
  McpServerStatusEvent,
} from '@mymoon-ai/agent-core-v2/agent/toolExecutor/toolExecutorEvents';
export type {
  ToolListUpdatedReason,
  McpServerStatusPayload,
} from '@mymoon-ai/agent-core-v2/agent/mcp/mcpEvents';

export type { ApprovalRequest, ApprovalScope } from '#/interaction';
export type { ApprovalDecision, ApprovalResponse } from '#/interaction';

export type { ToolInputDisplay } from '@mymoon-ai/agent-core-v2/tool/toolInputDisplay';

export type {
  QuestionRequest,
  QuestionItem,
  QuestionOption,
  QuestionAnswerMethod,
  QuestionAnswers,
  QuestionResponse,
  QuestionResult,
} from '#/interaction';

export type {
  SubagentSpawnedEvent,
  SubagentStartedEvent,
  SubagentCompletedEvent,
  SubagentFailedEvent,
  SubagentCancelledEvent,
} from '@mymoon-ai/agent-core-v2/session/subagent/mirrorAgentRun';
export type { SubagentSuspendedEvent } from '@mymoon-ai/agent-core-v2/features/swarm/session/sessionSwarmService';

export type {
  CompactionStartedEvent,
  CompactionBlockedEvent,
  CompactionCancelledEvent,
  CompactionCompletedEvent,
} from '@mymoon-ai/agent-core-v2/agent/fullCompaction/compactionOps';
export type { CompactionResult } from '@mymoon-ai/agent-core-v2/agent/fullCompaction/types';

export type {
  BackgroundTaskStartedEvent,
  BackgroundTaskTerminatedEvent,
} from '@mymoon-ai/agent-core-v2/agent/task/types';

export type { CronFiredEvent } from '@mymoon-ai/agent-core-v2/features/cron/cronOps';

export type MaybePromise<T> = T | Promise<T>;

export type ApprovalHandler = (request: ApprovalRequest) => MaybePromise<ApprovalResponse>;

export type QuestionHandler = (request: QuestionRequest) => MaybePromise<QuestionResult>;
