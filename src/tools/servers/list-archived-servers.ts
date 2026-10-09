import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { apiPath } from '../../forge/path.js';
import { defineTool } from '../define-tool.js';
import { organizationInput, paginationInput, paginationOutput, paginationSummary, responseFormatInput } from '../shared/schemas.js';
import { formatServer, serverOutput } from './format.js';

export const listArchivedServers = defineTool({
  name: 'forge_list_archived_servers',
  title: 'List archived servers',
  description: 'List the archived servers of the organization: servers Forge no longer manages but kept so they can be restored.',
  toolset: 'servers',
  operations: ['organizations.servers.archives.index'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: 'Check the organization slug with forge_list_organizations.',
  inputSchema: {
    organization: organizationInput,
    sort: z.array(z.enum(['created_at', '-created_at', 'updated_at', '-updated_at'])).min(1).optional(),
    ...paginationInput,
    response_format: responseFormatInput,
  },
  outputSchema: {
    servers: z.array(serverOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const response = await client.get<CollectionDocument>(apiPath`/orgs/${organization(args.organization)}/servers/archives`, {
      query: { sort: args.sort, page: { size: args.page_size, cursor: args.cursor } },
      signal,
    });
    const page = flattenCollection(response.data);
    const servers = page.items.map((item) => formatServer(item, args.response_format === 'detailed'));
    return {
      structured: { servers, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary: servers.length === 0 ? 'No archived servers.' : `Found ${servers.length} archived server(s).${paginationSummary(page.nextCursor)}`,
    };
  },
});
