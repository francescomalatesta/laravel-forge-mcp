import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { apiPath } from '../../forge/path.js';
import { defineTool } from '../define-tool.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { formatServer, serverOutput } from './format.js';

export const getServer = defineTool({
  name: 'forge_get_server',
  title: 'Get server',
  description:
    'Get every detail of a Forge server: provider, size, IP addresses, PHP and database versions, service status (database, Redis, OPcache), connection status and readiness.',
  toolset: 'core',
  operations: ['organizations.servers.show'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: 'Check the server ID with forge_list_servers.',
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
  },
  outputSchema: {
    server: serverOutput,
  },
  async handler(args, { client, organization, signal }) {
    const org = organization(args.organization);
    const response = await client.get<SingleDocument>(apiPath`/orgs/${org}/servers/${args.server}`, { signal });
    const server = formatServer(flattenSingle(response.data), true);
    const status = server.is_ready ? 'ready' : 'not ready';
    return {
      structured: { server },
      summary: `Server "${server.name}" (${server.id}) is ${status}, connection: ${server.connection_status ?? 'unknown'}.`,
    };
  },
});
