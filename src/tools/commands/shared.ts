import { z } from 'zod';
import { phaseOf, type Phase } from '../shared/async.js';
import { idInput, pick } from '../shared/schemas.js';
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
