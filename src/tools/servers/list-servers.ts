import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { apiPath } from '../../forge/path.js';
import type { components } from '../../forge/schema.gen.js';
import { defineTool } from '../define-tool.js';
import {
  organizationInput,
  paginationInput,
  paginationOutput,
  paginationSummary,
  responseFormatInput,
} from '../shared/schemas.js';
import { formatServer, serverOutput } from './format.js';

type ServerResource = components['schemas']['ServerResource'];

const SORT_FIELDS = ['name', 'provider', 'ubuntu_version', 'region', 'php_version', 'created_at', 'updated_at'] as const;
const SORT_VALUES = SORT_FIELDS.flatMap((field) => [field, `-${field}`]) as [string, ...string[]];

export const listServers = defineTool({
  name: 'forge_list_servers',
  title: 'List servers',
  description:
    'List servers in a Forge organization, optionally filtered and sorted. Use this to discover server IDs required by most other tools. Filters match exact values (e.g. php_version "php83", provider "ocean2"). Prefer response_format "concise" unless you need every field.',
  toolset: 'core',
  operations: ['organizations.servers.index'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: 'Check the organization slug with forge_list_organizations.',
  inputSchema: {
    organization: organizationInput,
    name: z.string().min(1).optional().describe('Filter by server name.'),
    ip_address: z.string().min(1).optional().describe('Filter by public IP address.'),
    provider: z.string().min(1).optional().describe('Filter by provider, e.g. "ocean2", "aws", "hetzner", "custom".'),
    region: z.string().min(1).optional().describe('Filter by provider region, e.g. "nyc3".'),
    size: z.string().min(1).optional().describe('Filter by provider size, e.g. "s-2vcpu-2gb".'),
    ubuntu_version: z.string().min(1).optional().describe('Filter by Ubuntu version, e.g. "24.04".'),
    php_version: z.string().min(1).optional().describe('Filter by default PHP version, e.g. "php83".'),
    database_type: z.string().min(1).optional().describe('Filter by database type, e.g. "mysql", "postgres".'),
    sort: z
      .array(z.enum(SORT_VALUES))
      .min(1)
      .optional()
      .describe('Sort fields in priority order; prefix with "-" for descending, e.g. ["-created_at"].'),
    ...paginationInput,
    response_format: responseFormatInput,
  },
  outputSchema: {
    servers: z.array(serverOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const org = organization(args.organization);
    const response = await client.get<CollectionDocument<ServerResource>>(apiPath`/orgs/${org}/servers`, {
      query: {
        filter: {
          name: args.name,
          ip_address: args.ip_address,
          provider: args.provider,
          region: args.region,
          size: args.size,
          ubuntu_version: args.ubuntu_version,
          php_version: args.php_version,
          database_type: args.database_type,
        },
        sort: args.sort,
        page: { size: args.page_size, cursor: args.cursor },
      },
      signal,
    });

    const page = flattenCollection(response.data);
    const servers = page.items.map((item) => formatServer(item, args.response_format === 'detailed'));

    return {
      structured: {
        servers,
        next_cursor: page.nextCursor,
        has_more: page.nextCursor !== null,
      },
      summary:
        servers.length === 0
          ? `No servers found in organization "${org}" matching the given filters.`
          : `Found ${servers.length} server(s) in organization "${org}".${paginationSummary(page.nextCursor)}`,
    };
  },
});
