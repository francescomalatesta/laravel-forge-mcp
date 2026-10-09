import { defineTool } from '../define-tool.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { BACKGROUND_PROCESS_NOT_FOUND_HINT, backgroundProcessInput, backgroundProcessPath } from './shared.js';

const CHECK_WITH = 'forge_list_background_processes';

export const deleteBackgroundProcess = defineTool({
  name: 'forge_delete_background_process',
  title: 'Delete background process',
  description: 'Stop a background process and remove it from Supervisor.',
  toolset: 'jobs',
  operations: ['organizations.servers.background-processes.destroy', 'organizations.servers.background-processes.show'],
  permissions: ['server:delete-daemons', 'server:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: BACKGROUND_PROCESS_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    background_process: backgroundProcessInput,
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = backgroundProcessPath(organization(args.organization), args.server, args.background_process);
    await client.delete(path, { signal });
    const action = `delete background process ${args.background_process}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => orGone(() => readResource(client, path, signal)),
      phase: (process) => (process === null ? 'completed' : 'pending'),
      describe: (process) => `Background process is ${process?.status ?? 'removing'}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
