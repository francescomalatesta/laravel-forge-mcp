/**
 * Asynchronous operations.
 *
 * Forge runs most write operations in the background (`x-processingMode: async`
 * in the spec, HTTP 202): the request is accepted and the work continues on the
 * server. Every tool covering such an operation follows the same contract,
 * documented in CLAUDE.md ("Asynchronous operations"):
 *
 * - it declares `async: true` (checked against the spec by tests);
 * - its output includes `operationOutput`: `status` + `check_with`;
 * - when the outcome can be observed through the API and the response does not
 *   already carry it, it accepts `waitInput()` and follows the operation with
 *   `waitFor()`, reading the resource until it leaves its transitional state
 *   (or disappears, for deletions: `orGone()`).
 */
import { z } from 'zod';
import { ForgeApiError, ForgeConnectionError } from '../../forge/errors.js';
import type { ToolContext } from '../define-tool.js';

export const POLL_INTERVAL_MS = 5_000;

export const OPERATION_STATUSES = ['queued', 'in_progress', 'completed', 'failed'] as const;
export type OperationStatus = (typeof OPERATION_STATUSES)[number];

/** Output fields shared by every asynchronous tool. */
export const operationOutput = {
  status: z
    .enum(OPERATION_STATUSES)
    .describe(
      'Outcome of the background operation. queued: accepted but not followed (wait=false or the state could not be read); in_progress: still running when the wait timed out; completed / failed: final result.',
    ),
  check_with: z.string().describe('Tool that shows the current state of the operation.'),
};

/** `wait` / `timeout_seconds` inputs for tools that can follow their operation. */
export function waitInput(defaultTimeoutSeconds: number) {
  return {
    wait: z.boolean().default(true).describe('Wait until Forge finishes the operation before returning.'),
    timeout_seconds: z
      .number()
      .int()
      .min(10)
      .max(900)
      .default(defaultTimeoutSeconds)
      .describe('Maximum time to wait when `wait` is true.'),
  };
}

export type Phase = 'pending' | 'completed' | 'failed';

/**
 * Classifies a resource status. `failed` values fail. With `completed`, only
 * those values complete and anything else is pending; otherwise `pending`
 * values are pending and anything else (including unknown values) completes.
 */
export function phaseOf(
  status: unknown,
  lists: { pending?: readonly string[]; completed?: readonly string[]; failed?: readonly string[] },
): Phase {
  const value = typeof status === 'string' ? status : '';
  if (lists.failed?.includes(value)) return 'failed';
  if (lists.completed) return lists.completed.includes(value) ? 'completed' : 'pending';
  return lists.pending?.includes(value) ? 'pending' : 'completed';
}

export interface WaitOptions<T> {
  /** Reads the current state of the operation (usually the affected resource). */
  poll: () => Promise<T>;
  phase: (value: T) => Phase;
  /** Short progress message, e.g. "Site 7 is creating". */
  describe: (value: T) => string;
  timeoutSeconds: number;
  context: Pick<ToolContext, 'sleep' | 'progress'>;
  /** State already known from the write response; otherwise the first poll provides it. */
  initial?: T;
}

export interface WaitResult<T> {
  status: Exclude<OperationStatus, 'queued'> | 'queued';
  /** Last state read, undefined if none could be read. */
  value: T | undefined;
  /** Why the operation could not be followed (status is then "queued"). */
  unfollowed?: string;
}

/**
 * Polls every POLL_INTERVAL_MS until the phase is final or the timeout expires,
 * sending MCP progress notifications. Read errors stop the wait without failing
 * the tool: the write already succeeded, so the result is "queued" with a reason.
 */
export async function waitFor<T>(options: WaitOptions<T>): Promise<WaitResult<T>> {
  const { poll, phase, describe, timeoutSeconds, context } = options;
  const maxPolls = Math.ceil((timeoutSeconds * 1000) / POLL_INTERVAL_MS);

  let value = options.initial;
  try {
    if (value === undefined) value = await poll();
    for (let attempt = 1; attempt <= maxPolls && phase(value) === 'pending'; attempt++) {
      await context.progress(attempt, maxPolls, describe(value));
      await context.sleep(POLL_INTERVAL_MS);
      value = await poll();
    }
  } catch (error) {
    if (error instanceof ForgeApiError || error instanceof ForgeConnectionError) {
      return { status: 'queued', value, unfollowed: `could not follow the operation (${error.message})` };
    }
    throw error;
  }

  const final = phase(value);
  return { status: final === 'pending' ? 'in_progress' : final, value };
}

/** Reads a resource, resolving to null once it no longer exists (404): use it to wait for deletions. */
export async function orGone<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof ForgeApiError && error.status === 404) return null;
    throw error;
  }
}

/** Result for an operation that was accepted and not followed. */
export function queued(action: string, checkWith: string, hint?: string) {
  return {
    structured: { status: 'queued' as const, check_with: checkWith },
    summary: `Forge accepted the request to ${action}; it runs in the background. Check the outcome with ${checkWith}${hint ? ` ${hint}` : ''}.`,
  };
}

/** Structured status and summary for the result of `waitFor()` (or a skipped wait). */
export function outcome(
  result: Pick<WaitResult<unknown>, 'status' | 'unfollowed'>,
  { action, checkWith, timeoutSeconds, detail }: { action: string; checkWith: string; timeoutSeconds: number; detail?: string },
) {
  const extra = detail ? ` ${detail}` : '';
  const summaries: Record<OperationStatus, string> = {
    completed: `Forge completed the request to ${action}.${extra}`,
    failed: `Forge could not ${action}.${extra} Check ${checkWith} for details.`,
    in_progress: `Forge is still working on the request to ${action} after ${timeoutSeconds}s. Check the outcome later with ${checkWith}.${extra}`,
    queued: `Forge accepted the request to ${action}; it runs in the background${
      result.unfollowed ? `, but the tool ${result.unfollowed}` : ''
    }. Check the outcome with ${checkWith}.${extra}`,
  };
  return { structured: { status: result.status, check_with: checkWith }, summary: summaries[result.status] };
}
