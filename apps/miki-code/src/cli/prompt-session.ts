import type {
  ConfigDiagnostics,
  CreateSessionOptions,
  MikiAuthFacade,
  MikiConfig,
  ListSessionsOptions,
  ResumeSessionInput,
  Session,
  SessionSummary,
  TelemetryProperties,
} from '@mymoon-ai/miki-code-sdk';

export interface PromptHarness {
  readonly homeDir: string;
  readonly auth: MikiAuthFacade;

  track(event: string, properties?: TelemetryProperties): void;

  ensureConfigFile(): Promise<void>;
  getConfig(): Promise<Pick<MikiConfig, 'defaultModel' | 'telemetry'>>;
  getConfigDiagnostics(): Promise<ConfigDiagnostics>;
  listSessions(options: ListSessionsOptions): Promise<readonly SessionSummary[]>;
  createSession(options: CreateSessionOptions): Promise<Session>;
  resumeSession(input: ResumeSessionInput): Promise<Session>;
  close(): Promise<void>;
}
