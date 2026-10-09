import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { idInput, organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { backgroundProcessOutput, backgroundProcessesPath, formatBackgroundProcess, processPhase } from './shared.js';

const CHECK_WITH = 'forge_list_background_processes';

export const createBackgroundProcess = defineTool({
  name: 'forge_create_background_process',
  title: 'Create background process',
  description:
    'Run a command permanently in the background under Supervisor (e.g. `php artisan queue:work`), restarting it when it exits. For Horizon, Octane, Reverb, Pulse or Inertia SSR prefer forge_enable_site_integration. Waits until it is running unless `wait` is false.',
  toolset: 'jobs',
  operations: ['organizations.servers.background-processes.store', 'organizations.servers.background-processes.show'],
  permissions: ['server:create-daemons', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    name: z.string().min(1).describe('Name of the background process, e.g. "Queue worker".'),
    command: z.string().min(1).describe('Command to run, e.g. "php artisan queue:work --tries=3".'),
    user: z.enum(['forge', 'root']).default('forge').describe('User the process runs as.'),
    site: idInput('Site the process belongs to.').optional(),
    directory: z.string().min(1).optional().describe('Working directory, e.g. "/home/forge/example.com/current".'),
    processes: z.number().int().min(1).default(1).describe('Number of processes to keep running.'),
    startsecs: z.number().int().min(0).optional().describe('Seconds the process must stay up to be considered started.'),
    stopwaitsecs: z.number().int().min(0).optional().describe('Seconds to wait for a graceful stop before killing it.'),
    stopsignal: z.string().min(1).optional().describe('Signal sent to stop it, e.g. "SIGTERM".'),
    ...waitInput(120),
  },
  outputSchema: {
    ...operationOutput,
    background_process: backgroundProcessOutput.nullable(),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const base = backgroundProcessesPath(organization(args.organization), args.server);
    const response = await client.post<SingleDocument | undefined>(base, {
      body: {
        name: args.name,
        site_id: args.site === undefined ? undefined : Number(args.site),
        command: args.command,
        user: args.user,
        directory: args.directory,
        processes: args.processes,
        startsecs: args.startsecs,
        stopwaitsecs: args.stopwaitsecs,
        stopsignal: args.stopsignal,
      },
      signal,
    });
    const initial = response.data?.data ? flattenSingle(response.data) : undefined;
    const action = `start \`${args.command}\` in the background`;
    if (!initial || !args.wait) {
      return {
        structured: { status: 'queued' as const, check_with: CHECK_WITH, background_process: initial ? formatBackgroundProcess(initial) : null },
        summary: `Forge accepted the request to ${action}. Check it with ${CHECK_WITH}.`,
      };
    }

    const result = await waitFor({
      initial,
      poll: () => readResource(client, `${base}/${encodeURIComponent(initial.id)}`, signal),
      phase: (process) => processPhase(process.status, 'running'),
      describe: (process) => `Background process is ${process.status}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const process = formatBackgroundProcess(result.value ?? initial);
    const done = outcome(result, {
      action,
      checkWith: CHECK_WITH,
      timeoutSeconds: args.timeout_seconds,
      detail: `Process ID: ${process.id}.${result.status === 'failed' ? ' Read why with forge_get_background_process_log.' : ''}`,
    });
    return { structured: { ...done.structured, background_process: process }, summary: done.summary };
  },
});
