import { apiPath } from '../../forge/path.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT, archivedServerIds } from './shared.js';

const CHECK_WITH = 'forge_list_archived_servers';

export const archiveServer = defineTool({
  name: 'forge_archive_server',
  title: 'Archive server',
  description:
    'Archive a server: Forge stops managing it (no deployments, no monitoring) but the machine keeps running at the provider and can be restored with forge_unarchive_server.',
  toolset: 'servers',
  operations: ['organizations.servers.archives.store', 'organizations.servers.archives.index'],
  permissions: ['server:archive', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    ...waitInput(120),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const org = organization(args.organization);
    await client.post(apiPath`/orgs/${org}/servers/archives`, { body: { server_id: Number(args.server) }, signal });
    const action = `archive server ${args.server}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => archivedServerIds(client, org, signal),
      phase: (ids) => (ids.has(String(args.server)) ? 'completed' : 'pending'),
      describe: () => `Waiting for server ${args.server} to be archived`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
