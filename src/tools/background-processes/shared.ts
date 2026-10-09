import { z } from 'zod';
import { phaseOf, type Phase } from '../shared/async.js';
import { idInput, pick } from '../shared/schemas.js';
import { serverPath } from '../servers/shared.js';

export function backgroundProcessesPath(org: string, server: string | number): string {
  return `${serverPath(org, server)}/background-processes`;
}

export function backgroundProcessPath(org: string, server: string | number, process: string | number): string {
  return `${backgroundProcessesPath(org, server)}/${encodeURIComponent(String(process))}`;
}

export const backgroundProcessInput = idInput('Background process ID. Use forge_list_background_processes to find it.');

export const BACKGROUND_PROCESS_NOT_FOUND_HINT = 'Check the background process ID with forge_list_background_processes.';

const FIELDS = ['id', 'command', 'user', 'directory', 'processes', 'status', 'created_at'] as const;

export const backgroundProcessOutput = z.looseObject({
  id: z.string(),
  command: z.string().nullable(),
  user: z.string().nullable(),
  directory: z.string().nullable(),
  processes: z.number().nullable().describe('Number of processes Supervisor keeps running.'),
  status: z
    .string()
    .nullable()
    .describe('installing, removing, restarting, starting, stopping, running, stopped, fatal, backoff, exited or unknown.'),
  created_at: z.string().nullable(),
});

export type BackgroundProcessOutput = z.output<typeof backgroundProcessOutput>;

export function formatBackgroundProcess(flat: Record<string, unknown>): BackgroundProcessOutput {
  return pick(flat, FIELDS) as BackgroundProcessOutput;
}

/** Waits for `target`; fatal and exited mean Supervisor gave up (backoff is still retrying). */
export function processPhase(status: unknown, target: 'running' | 'stopped'): Phase {
  return phaseOf(status, { completed: [target], failed: ['fatal', 'exited'] });
}
