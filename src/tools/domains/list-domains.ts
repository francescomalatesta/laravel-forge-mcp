import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { paginationInput, paginationOutput, paginationSummary } from '../shared/schemas.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from '../shared/site-scope.js';
import { domainOutput, formatDomain } from './shared.js';

const STATUSES = ['pending', 'connecting', 'enabled', 'removing', 'securing', 'updating', 'disabling', 'disabled', 'enabling'] as const;

export const listDomains = defineTool({
  name: 'forge_list_domains',
  title: 'List domains',
  description:
    'List the domains of a site (the primary domain and its aliases) with their status and www redirection. Use forge_get_domain for the DNS records to configure.',
  toolset: 'sites',
  operations: ['organizations.servers.sites.domains.index'],
  permissions: ['site:meta'],
  readOnly: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    status: z.enum(STATUSES).optional().describe('Filter by status.'),
    type: z.enum(['primary', 'alias']).optional().describe('Filter by type.'),
    sort: z.array(z.enum(['name', '-name', 'created_at', '-created_at'])).min(1).optional(),
    ...paginationInput,
  },
  outputSchema: {
    domains: z.array(domainOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const response = await client.get<CollectionDocument>(
      `${sitePath(organization(args.organization), args.server, args.site)}/domains`,
      {
        query: {
          filter: { status: args.status, type: args.type },
          sort: args.sort,
          page: { size: args.page_size, cursor: args.cursor },
        },
        signal,
      },
    );
    const page = flattenCollection(response.data);
    const domains = page.items.map(formatDomain);
    return {
      structured: { domains, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        domains.length === 0
          ? 'No domains found for the site.'
          : `Found ${domains.length} domain(s): ${domains.map((d) => `${d.name} (${d.status})`).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
