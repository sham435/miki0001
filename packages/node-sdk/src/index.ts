export { MikiHarness } from '#/miki-harness';
export type { MikiHarnessRuntimeOptions } from '#/miki-harness';
export { Session } from '#/session';
export { MikiAuthFacade } from '#/auth';
export {
  createMikiHarness,
  SDKRpcClientV2,
  type SDKRpcClientV2Options,
} from '#/sdk-rpc-client-v2';
export {
  createMikiConfigRpc,
  MikiConfigRpcClient,
  type MikiConfigRpc,
  type MikiConfigValidationIssue,
  type MikiConfigValidationPathSegment,
  type ResolveMikiConfigPathInput,
  type ValidateMikiConfigTomlInput,
} from '#/config-rpc';
export { SDKRpcClientBase } from '#/rpc';
export type { ConfigSectionChange } from '#/rpc';
export { MikiForCodingProvider } from '#/miki-code-model-provider';
export type { MikiForCodingProviderOptions } from '#/miki-code-model-provider';

export {
  applyCatalogProvider,
  catalogBaseUrl,
  catalogModelToAlias,
  catalogProviderModels,
  CatalogFetchError,
  RegistryImportError,
  DEFAULT_CATALOG_URL,
  fetchCatalog,
  inferWireType,
  loadBuiltInCatalog,
  resolveCatalogImport,
} from '#/catalog';
export type {
  ApplyCatalogProviderOptions,
  Catalog,
  CatalogImportInvalidReason,
  CatalogImportResolution,
  CatalogModel,
  CatalogProviderEntry,
  FetchCatalogOptions,
} from '#/catalog';

export {
  ErrorCodes,
  MikiError,
  type MikiErrorCode,
  type MikiErrorInfo,
  type MikiErrorOptions,
  type MikiErrorPayload,
  MIKI_ERROR_INFO,
  fromMikiErrorPayload,
  isMikiError,
  toMikiErrorPayload,
} from '#/errors';

export {
  flushDiagnosticLogs,
  flushDiagnosticLogsSync,
  log,
  redact,
  resolveGlobalLogPath,
} from '#/logging/index';
export { resolveMikiHome } from '@mymoon-ai/agent-core-v2';
export type { LogContext, LogLevel, LogPayload, Logger } from '#/logging/index';

export { effectiveModelAlias, loadRuntimeConfigSafe } from '#/config/index';
export { resolveConfigPath } from '@mymoon-ai/agent-core-v2';
export { limitAgentReplayByTurns } from '#/replay';
export { parseAgentFileText, resolveAgentPath } from '@mymoon-ai/agent-core-v2';
export { SECONDARY_DERIVED_MODEL_ALIAS } from '#/config/index';
export { PRIMARY_SUBAGENT_MODEL_CHOICE } from '@mymoon-ai/agent-core-v2/session/subagent/configSection';

export { installGlobalProxyDispatcher } from '#/proxy';

export {
  buildImageCompressionCaption,
  buildUnsupportedImageNotice,
  gateImageFormatParts,
  isModelAcceptedImageMime,
  normalizeImageMime,
  parseImageDataUrl,
  persistOriginalImage,
  sessionMediaOriginalsDir,
  IMAGE_BYTE_BUDGET,
  MAX_IMAGE_EDGE_PX,
} from '@mymoon-ai/agent-core-v2';
export { compressBase64ForModel, compressImageForModel, ImageLimits } from '#/image';
export type {
  CompressImageOptions,
  CompressImageResult,
  CompressBase64Result,
  ImageCompressionCaptionInput,
  ImageCompressionTelemetry,
} from '#/image';

export type {
  ExperimentalFeatureState,
  ExperimentalFlagMap,
  ExperimentalFlagSource,
  FlagDefinition,
  FlagDefinitionInput,
  FlagId,
  FlagSurface,
} from '#/flag';

export {
  buildDaemonFileUrl,
  buildMediaPathTag,
  isDaemonFileUrl,
  matchSingleMediaPathTag,
  parseDaemonFileUrl,
} from '@mymoon-ai/agent-core-v2/agent/media/mediaRef';
export type {
  DaemonFileRef,
  MediaKind,
} from '@mymoon-ai/agent-core-v2/agent/media/mediaRef';

export type {
  MikiAuthCompleteFeedbackUploadInput,
  MikiAuthCompleteFeedbackUploadPart,
  MikiAuthCreateFeedbackUploadUrlInput,
  MikiAuthCreateFeedbackUploadUrlOk,
  MikiAuthCreateFeedbackUploadUrlResult,
  MikiAuthFeedbackUploadPart,
  MikiAuthLoginResult,
  MikiAuthLogoutResult,
  MikiAuthSubmitFeedbackInput,
} from '#/auth';

export * from '#/events';
export type * from '#/types';
