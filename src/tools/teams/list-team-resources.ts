import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { organizationInput, paginationInput, paginationOutput, paginationSummary, pick } from '../shared/schemas.js';
import { SHAREABLE, shareableInput, sharedItemOutput, sharingOperations } from './sharing.js';
import { TEAM_NOT_FOUND_HINT, teamInput, teamPath } from './shared.js';

export const listTeamResources = defineTool({
  name: 'forge_list_team_resources',
  title: 'List team resources',
  description: 'List the servers, recipes or provider credentials shared with a team.',
  toolset: 'teams',
  operations: sharingOperations('index'),
  permissions: ['server:view', 'recipe:view', 'credential:view'],
  readOnly: true,
  notFoundHint: TEAM_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    team: teamInput,
    resource: shareableInput,
    ...paginationInput,
  },
  outputSchema: {
    items: z.array(sharedItemOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const response = await client.get<CollectionDocument>(`${teamPath(organization(args.organization), args.team)}/${SHAREABLE[args.resource].segment}`, {
      query: { page: { size: args.page_size, cursor: args.cursor } },
      signal,
    });
    const page = flattenCollection(response.data);
    const items = page.items.map((item) => pick(item, ['id', 'name']) as z.output<typeof sharedItemOutput>);
    return {
      structured: { items, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        items.length === 0
          ? `No ${args.resource} are shared with this team.`
          : `Shared ${args.resource}: ${items.map((item) => `${item.name} (${item.id})`).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
