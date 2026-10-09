import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { apiPath } from '../../forge/path.js';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import {
  idInput,
  organizationInput,
  paginationInput,
  paginationOutput,
  paginationSummary,
  responseFormatInput,
} from '../shared/schemas.js';
import { formatSite, siteOutput } from './format.js';

const SORT_FIELDS = ['name', 'created_at', 'updated_at'] as const;
const SORT_VALUES = SORT_FIELDS.flatMap((field) => [field, `-${field}`]) as [string, ...string[]];

export const listSites = defineTool({
  name: 'forge_list_sites',
  title: 'List sites',
  description:
    'List Forge sites with their status, repository, server and latest deployment. By default lists every site in the organization; pass `server` to list the sites of one server, or `all_organizations` to list every site the token can access. Each site includes `server_id`, needed together with the site ID by site and deployment tools.',
  toolset: 'core',
  operations: ['organizations.sites.index', 'organizations.servers.sites.index', 'sites.index'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: 'Check the organization slug with forge_list_organizations and the server ID with forge_list_servers.',
  inputSchema: {
    organization: organizationInput,
    server: idInput('Only list the sites of this server.').optional(),
    all_organizations: z
      .boolean()
      .default(false)
      .describe('List sites across every organization the token can access (ignores `organization`).'),
    name: z.string().min(1).optional().describe('Filter by site name (domain).'),
    sort: z
      .array(z.enum(SORT_VALUES))
      .min(1)
      .optional()
      .describe('Sort fields; only supported together with `server`. Prefix with "-" for descending.'),
    ...paginationInput,
    response_format: responseFormatInput,
  },
  outputSchema: {
    sites: z.array(siteOutput),
    ...paginationOutput,
  },
  async handler(args, { client, config, organization, signal }) {
    if (args.server !== undefined && args.all_organizations) {
      throw new ToolInputError('Pass either `server` or `all_organizations`, not both.');
    }
    if (args.sort && args.server === undefined) {
      throw new ToolInputError('Sorting is only supported when listing the sites of a server: pass `server` or remove `sort`.');
    }

    const page = { size: args.page_size, cursor: args.cursor };
    const filter = { name: args.name };
    let path: string;
    let scope: string;
    let include: string[];
    if (args.server !== undefined) {
      const org = organization(args.organization);
      path = apiPath`/orgs/${org}/servers/${args.server}/sites`;
      scope = `server ${args.server}`;
      include = ['latestDeployment'];
    } else if (args.all_organizations) {
      path = '/sites';
      scope = 'all organizations';
      include = ['server', 'latestDeployment'];
    } else {
      const org = organization(args.organization);
      path = apiPath`/orgs/${org}/sites`;
      scope = `organization "${org}"`;
      include = ['server', 'latestDeployment'];
    }

    const response = await client.get<CollectionDocument>(path, {
      query: { filter, sort: args.sort, include, page },
      signal,
    });
    const result = flattenCollection(response.data);
    const sites = result.items.map((item) =>
      formatSite(item, {
        detailed: args.response_format === 'detailed',
        allowSecrets: config.allowSecrets,
        ...(args.server !== undefined ? { serverId: String(args.server) } : {}),
      }),
    );

    return {
      structured: { sites, next_cursor: result.nextCursor, has_more: result.nextCursor !== null },
      summary:
        sites.length === 0
          ? `No sites found in ${scope} matching the given filters.`
          : `Found ${sites.length} site(s) in ${scope}.${paginationSummary(result.nextCursor)}`,
    };
  },
});
