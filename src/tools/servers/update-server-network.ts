import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT, serverPath } from './shared.js';

const CHECK_WITH = 'forge_get_server_network';

export const updateServerNetwork = defineTool({
  name: 'forge_update_server_network',
  title: 'Update server network',
  description:
    "Set which servers are in this server's network (the full list: servers not listed are removed). Read the current list first with forge_get_server_network.",
  toolset: 'servers',
  operations: ['organizations.servers.network.update', 'organizations.servers.network.show'],
  permissions: ['server:manage-network', 'server:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    servers: z.array(z.number().int()).describe('IDs of every server that should be in the network (can be empty).'),
    ...waitInput(120),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = `${serverPath(organization(args.organization), args.server)}/network`;
    await client.put(path, { body: { servers: args.servers }, signal });
    const action = 'update the server network';
    if (!args.wait) return queued(action, CHECK_WITH);

    const wanted = [...new Set(args.servers.map(String))].sort().join(',');
    const result = await waitFor({
      poll: async () => {
        const response = await client.get<CollectionDocument>(path, { signal });
        return flattenCollection(response.data).items.map((item) => item.id).sort().join(',');
      },
      phase: (current) => (current === wanted ? 'completed' : 'pending'),
      describe: () => 'Waiting for the network to be updated',
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
