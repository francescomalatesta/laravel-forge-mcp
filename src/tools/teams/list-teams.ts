import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { organizationInput, paginationInput, paginationOutput, paginationSummary } from '../shared/schemas.js';
import { formatTeam, teamInput, teamOutput, teamPath, teamsPath } from './shared.js';

export const listTeams = defineTool({
  name: 'forge_list_teams',
  title: 'List teams',
  description: 'List the teams of the organization (groups of users sharing servers, recipes and credentials), or get one with `team`.',
  toolset: 'teams',
  operations: ['organizations.teams.index', 'organizations.teams.show'],
  permissions: ['team:view'],
  readOnly: true,
  inputSchema: {
    organization: organizationInput,
    team: teamInput.optional().describe('Return only this team.'),
    ...paginationInput,
  },
  outputSchema: {
    teams: z.array(teamOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const org = organization(args.organization);
    if (args.team !== undefined) {
      const team = formatTeam(await readResource(client, teamPath(org, args.team), signal));
      return { structured: { teams: [team], next_cursor: null, has_more: false }, summary: `Team ${team.name}.` };
    }
    const response = await client.get<CollectionDocument>(teamsPath(org), { query: { page: { size: args.page_size, cursor: args.cursor } }, signal });
    const page = flattenCollection(response.data);
    const teams = page.items.map(formatTeam);
    return {
      structured: { teams, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary: teams.length === 0 ? 'No teams found.' : `Found ${teams.length} team(s): ${teams.map((t) => `${t.name} (${t.id})`).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
