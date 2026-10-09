import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import {
  BACKGROUND_PROCESS_NOT_FOUND_HINT,
  backgroundProcessInput,
  backgroundProcessOutput,
  backgroundProcessPath,
  formatBackgroundProcess,
  processPhase,
} from './shared.js';

const CHECK_WITH = 'forge_list_background_processes';
const TARGET = { start: 'running', stop: 'stopped' } as const;

export const runBackgroundProcessAction = defineTool({
  name: 'forge_run_background_process_action',
  title: 'Run background process action',
  description:
    'Start, stop or restart a background process (e.g. restart queue workers after changing code outside a deployment), or empty its log. Waits for start and stop; restart and empty-log cannot be observed through the API.',
  toolset: 'jobs',
  operations: ['organizations.servers.background-processes.actions.store', 'organizations.servers.background-processes.show'],
  permissions: ['server:create-daemons', 'server:view'],
  readOnly: false,
  destructive: true,
  idempotent: false,
  async: true,
  notFoundHint: BACKGROUND_PROCESS_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    background_process: backgroundProcessInput,
    action: z.enum(['restart', 'start', 'stop', 'empty-log']).describe('Action to run.'),
    ...waitInput(60),
  },
  outputSchema: {
    ...operationOutput,
    background_process: backgroundProcessOutput.nullable(),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = backgroundProcessPath(organization(args.organization), args.server, args.background_process);
    await client.post(`${path}/actions`, { body: { action: args.action }, signal });
    const action = `${args.action} background process ${args.background_process}`;
    const target = args.action === 'start' || args.action === 'stop' ? TARGET[args.action] : undefined;
    if (!target || !args.wait) {
      // A restart ends in "running" like before it, and the log content is not compared: nothing to wait for.
      const accepted = queued(action, CHECK_WITH);
      return { ...accepted, structured: { ...accepted.structured, background_process: null } };
    }

    const result = await waitFor({
      poll: () => readResource(client, path, signal),
      phase: (process) => processPhase(process.status, target),
      describe: (process) => `Background process is ${process.status}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
    return {
      structured: { ...done.structured, background_process: result.value ? formatBackgroundProcess(result.value) : null },
      summary: done.summary,
    };
  },
});
