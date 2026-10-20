import { resolveConfigPath } from '@mymoon-ai/agent-core-v2';
import { z } from 'zod';

import { parseConfigString } from '#/config/index';
import { ErrorCodes, MikiError } from '#/errors';

export type MikiConfigValidationPathSegment = string | number;

export interface MikiConfigValidationIssue {
  readonly path: readonly MikiConfigValidationPathSegment[];
  readonly message: string;
}

export interface ResolveMikiConfigPathInput {
  readonly homeDir?: string | undefined;
  readonly configPath?: string | undefined;
}

export interface ValidateMikiConfigTomlInput {
  readonly text: string;
  readonly filePath?: string | undefined;
}

export interface MikiConfigRpc {
  resolveConfigPath(input?: ResolveMikiConfigPathInput): Promise<string>;
  validateConfigToml(input: ValidateMikiConfigTomlInput): Promise<void>;
}

export class MikiConfigRpcClient implements MikiConfigRpc {
  async resolveConfigPath(input: ResolveMikiConfigPathInput = {}): Promise<string> {
    return resolveConfigPath(input);
  }

  async validateConfigToml(input: ValidateMikiConfigTomlInput): Promise<void> {
    try {
      parseConfigString(input.text, input.filePath);
    } catch (error) {
      const validationIssues = extractValidationIssues(error);
      if (validationIssues !== undefined) {
        throw toConfigValidationError(error, validationIssues);
      }
      throw error;
    }
  }
}

export function createMikiConfigRpc(): MikiConfigRpc {
  return new MikiConfigRpcClient();
}

function toConfigValidationError(
  error: unknown,
  validationIssues: readonly MikiConfigValidationIssue[],
): MikiError {
  const details =
    error instanceof MikiError && error.details !== undefined
      ? { ...error.details, validationIssues }
      : { validationIssues };

  if (error instanceof MikiError) {
    return new MikiError(error.code, error.message, { details });
  }

  const message = error instanceof Error ? error.message : String(error);
  return new MikiError(ErrorCodes.CONFIG_INVALID, message, { details });
}

function extractValidationIssues(error: unknown): readonly MikiConfigValidationIssue[] | undefined {
  const zodError = findZodError(error);
  if (zodError === undefined) return undefined;
  return zodError.issues.map((issue) => ({
    path: issue.path.map((segment) =>
      typeof segment === 'number' ? segment : String(segment),
    ),
    message: issue.message,
  }));
}

function findZodError(error: unknown): z.ZodError | undefined {
  if (error instanceof z.ZodError) return error;
  if (error instanceof Error && error.cause instanceof z.ZodError) return error.cause;
  return undefined;
}
