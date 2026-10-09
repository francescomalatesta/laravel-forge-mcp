import type { z } from 'zod';
import type { Config } from '../config.js';
import type { ForgeClient } from '../forge/client.js';
import type { ToolsetName } from './toolsets.js';

export interface ToolContext {
  client: ForgeClient;
  config: Config;
  /** Returns the explicit organization or the configured default; throws a helpful error if neither is set. */
  organization(explicit: string | undefined): string;
  /** Aborted when the MCP client cancels the call. */
  signal: AbortSignal;
}

export interface ToolResult<Output> {
  /** Returned as `structuredContent`; must match `outputSchema`. */
  structured: Output;
  /** One or two sentences for the model: what was found and what to do next. */
  summary: string;
}

export interface ToolDefinition<Input extends z.ZodRawShape = z.ZodRawShape, Output extends z.ZodRawShape = z.ZodRawShape> {
  /** snake_case, prefixed with `forge_`. */
  name: string;
  title: string;
  /** What the tool does and when to use it. Permissions are appended automatically. */
  description: string;
  toolset: ToolsetName;
  /** OpenAPI operationIds covered by this tool (used by the coverage report). */
  operations: readonly string[];
  /** Forge permissions (token scopes) required, from the spec's `x-permissions`. */
  permissions: readonly string[];
  /** Only reads data. Read-only tools are the only ones registered in read-only mode. */
  readOnly: boolean;
  /** May destroy data or cause downtime. Defaults to `!readOnly`. */
  destructive?: boolean;
  /** Repeating the call with the same arguments has no additional effect. Defaults to `readOnly`. */
  idempotent?: boolean;
  /** Returns secrets; registered only when FORGE_ALLOW_SECRETS is enabled. */
  exposesSecrets?: boolean;
  /** Extra guidance appended to 404 errors, e.g. which tool lists valid IDs. */
  notFoundHint?: string;
  inputSchema: Input;
  outputSchema: Output;
  handler(
    args: z.output<z.ZodObject<Input>>,
    context: ToolContext,
  ): Promise<ToolResult<z.output<z.ZodObject<Output>>>>;
}

/** Identity helper that gives full type inference for tool definitions. */
export function defineTool<Input extends z.ZodRawShape, Output extends z.ZodRawShape>(
  definition: ToolDefinition<Input, Output>,
): ToolDefinition<Input, Output> {
  return definition;
}

/** Type-erased form used by the registry. */
export type AnyToolDefinition = ToolDefinition<any, any>;
