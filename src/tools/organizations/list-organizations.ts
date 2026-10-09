import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { paginationInput, paginationOutput, paginationSummary, pick } from '../shared/schemas.js';

const ORGANIZATION_FIELDS = ['id', 'name', 'slug', 'created_at', 'updated_at'] as const;

const organizationOutput = z.looseObject({
  id: z.string(),
  name: z.string().nullable(),
  slug: z.string().nullable().describe('Use this value as the `organization` argument of other tools.'),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export const listOrganizations = defineTool({
  name: 'forge_list_organizations',
  title: 'List organizations',
  description:
    'List the Forge organizations the API token can access. Every other Forge resource lives inside an organization: use the returned `slug` as the `organization` argument of other tools (unless FORGE_ORGANIZATION is configured).',
  toolset: 'core',
  operations: ['organizations.index'],
  permissions: ['organization:view'],
  readOnly: true,
  inputSchema: {
    ...paginationInput,
  },
  outputSchema: {
    organizations: z.array(organizationOutput),
    ...paginationOutput,
  },
  async handler(args, { client, signal }) {
    const response = await client.get<CollectionDocument>('/orgs', {
      query: { page: { size: args.page_size, cursor: args.cursor } },
      signal,
    });
    const page = flattenCollection(response.data);
    const organizations = page.items.map((item) => pick(item, ORGANIZATION_FIELDS) as z.output<typeof organizationOutput>);

    return {
      structured: {
        organizations,
        next_cursor: page.nextCursor,
        has_more: page.nextCursor !== null,
      },
      summary:
        organizations.length === 0
          ? 'No organizations are accessible with this API token.'
          : `Found ${organizations.length} organization(s): ${organizations.map((org) => org.slug).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
