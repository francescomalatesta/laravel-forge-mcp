import { defineTool } from '../define-tool.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { monitorInput, monitorsPath } from './shared.js';

const CHECK_WITH = 'forge_list_monitors';

export const deleteMonitor = defineTool({
  name: 'forge_delete_monitor',
  title: 'Delete monitor',
  description: 'Remove a monitor from a server: its alerts stop.',
  toolset: 'monitoring',
  operations: ['organizations.servers.monitors.destroy', 'organizations.servers.monitors.show'],
  permissions: ['server:delete-monitors', 'server:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: 'Check the monitor ID with forge_list_monitors.',
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    monitor: monitorInput,
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = `${monitorsPath(organization(args.organization), args.server)}/${encodeURIComponent(String(args.monitor))}`;
    await client.delete(path, { signal });
    const action = `delete monitor ${args.monitor}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => orGone(() => readResource(client, path, signal)),
      phase: (monitor) => (monitor === null ? 'completed' : 'pending'),
      describe: (monitor) => `Monitor is ${monitor?.status ?? 'removing'}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
