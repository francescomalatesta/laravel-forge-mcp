import { z } from 'zod';
import type { ForgeClient } from '../../forge/client.js';
import { ForgeApiError } from '../../forge/errors.js';
import { phaseOf, type Phase } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { idInput, pick, tail } from '../shared/schemas.js';
import { sitePath } from '../shared/site-scope.js';

export const COMMAND_STATUSES = ['waiting', 'running', 'finished', 'timeout', 'failed'] as const;

export function commandsPath(org: string, server: string | number, site: string | number): string {
  return `${sitePath(org, server, site)}/commands`;
}

export const commandInput = idInput('Command run ID. Use forge_list_site_commands to find it.');

const FIELDS = ['id', 'command', 'status', 'exit_code', 'error_output', 'duration', 'user_id', 'created_at', 'updated_at'] as const;

export const commandOutput = z.looseObject({
  id: z.string(),
  command: z.string().nullable(),
  status: z.string().nullable().describe('waiting, running, finished, timeout or failed.'),
  exit_code: z.number().nullable().describe('Null while running, or when the command never produced one (SSH failure, timeout).'),
  error_output: z.string().nullable().describe('Failure detail when the command did not succeed.'),
  duration: z.string().nullable(),
  user_id: z.number().nullable().describe('User who ran the command.'),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type CommandOutput = z.output<typeof commandOutput>;

export function formatCommand(flat: Record<string, unknown>): CommandOutput {
  return pick(flat, FIELDS) as CommandOutput;
}

/** Finished with a non-zero exit code counts as a failure. */
export function commandPhase(command: Record<string, unknown>): Phase {
  const phase = phaseOf(command.status, { completed: ['finished'], failed: ['failed', 'timeout'] });
  if (phase === 'completed' && typeof command.exit_code === 'number' && command.exit_code !== 0) return 'failed';
  return phase;
}

export const outputLinesInput = (fallback: number) =>
  z.number().int().min(0).max(5000).default(fallback).describe('Return only the last N lines of the output (0 = full output).');

export const outputFields = {
  output: z.string().nullable().describe('Command output (last `output_lines` lines), or null when unavailable.'),
  output_truncated: z.boolean(),
  output_total_lines: z.number().int().nullable(),
};

export type OutputFields = z.output<z.ZodObject<typeof outputFields>>;

export const NO_OUTPUT: OutputFields = { output: null, output_truncated: false, output_total_lines: null };

/** Reads the output of a command run; null output when there is none yet. */
export async function fetchOutput(client: ForgeClient, path: string, lines: number, signal: AbortSignal): Promise<OutputFields> {
  try {
    const output = tail((await readResource(client, `${path}/output`, signal)).output as string | null | undefined, lines);
    return { output: output.text, output_truncated: output.truncated, output_total_lines: output.total_lines };
  } catch (error) {
    if (error instanceof ForgeApiError && error.status === 404) return NO_OUTPUT;
    throw error;
  }
}
