import { apiPath } from '../../forge/path.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { archivedServerIds } from './shared.js';

const CHECK_WITH = 'forge_list_servers';

export const unarchiveServer = defineTool({
  name: 'forge_unarchive_server',
  title: 'Unarchive server',
  description: 'Restore an archived server so Forge manages it again.',
  toolset: 'servers',
  operations: ['organizations.servers.archives.destroy', 'organizations.servers.archives.index'],
  permissions: ['server:archive', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: 'Check the server ID with forge_list_archived_servers.',
  inputSchema: {
    organization: organizationInput,
    server: serverInput.describe('ID of the archived server. Use forge_list_archived_servers to find it.'),
    ...waitInput(120),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const org = organization(args.organization);
    await client.delete(apiPath`/orgs/${org}/servers/archives/${args.server}`, { signal });
    const action = `unarchive server ${args.server}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => archivedServerIds(client, org, signal),
      phase: (ids) => (ids.has(String(args.server)) ? 'pending' : 'completed'),
      describe: () => `Waiting for server ${args.server} to be restored`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
