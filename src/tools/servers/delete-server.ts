import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT, readServer, serverPath } from './shared.js';

const CHECK_WITH = 'forge_list_servers';

export const deleteServer = defineTool({
  name: 'forge_delete_server',
  title: 'Delete server',
  description:
    'Delete a server from Forge and destroy it at the provider, with every site and database on it. With `preserve_at_provider: true` it is only removed from Forge and keeps running at the provider. This cannot be undone: consider forge_archive_server instead.',
  toolset: 'servers',
  operations: ['organizations.servers.destroy', 'organizations.servers.show'],
  permissions: ['server:delete', 'server:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    preserve_at_provider: z.boolean().default(false).describe('Only remove the server from Forge, keeping the machine at the provider.'),
    ...waitInput(300),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const org = organization(args.organization);
    await client.delete(serverPath(org, args.server), {
      query: { preserve_at_provider: args.preserve_at_provider ? 'true' : undefined },
      signal,
    });
    const action = `delete server ${args.server}${args.preserve_at_provider ? ' from Forge (keeping it at the provider)' : ''}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => orGone(() => readServer(client, org, args.server, signal)),
      phase: (server) => (server === null ? 'completed' : 'pending'),
      describe: () => `Waiting for server ${args.server} to be deleted`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
