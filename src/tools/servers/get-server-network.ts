import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { formatServer, serverOutput } from './format.js';
import { SERVER_NOT_FOUND_HINT, serverPath } from './shared.js';

export const getServerNetwork = defineTool({
  name: 'forge_get_server_network',
  title: 'Get server network',
  description:
    'List the servers in this server\'s network: Forge opens the firewall between them so they can reach each other (e.g. an app server and its database or cache server).',
  toolset: 'servers',
  operations: ['organizations.servers.network.show'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
  },
  outputSchema: {
    servers: z.array(serverOutput),
  },
  async handler(args, { client, organization, signal }) {
    const response = await client.get<CollectionDocument>(`${serverPath(organization(args.organization), args.server)}/network`, { signal });
    const servers = flattenCollection(response.data).items.map((item) => formatServer(item, false));
    return {
      structured: { servers },
      summary:
        servers.length === 0
          ? 'No other servers are in this server\'s network.'
          : `${servers.length} server(s) in the network: ${servers.map((s) => `${s.name} (${s.id})`).join(', ')}.`,
    };
  },
});
