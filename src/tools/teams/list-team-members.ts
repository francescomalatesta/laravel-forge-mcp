import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { idInput, organizationInput, paginationInput, paginationOutput, paginationSummary } from '../shared/schemas.js';
import { formatMember, memberOutput, TEAM_NOT_FOUND_HINT, teamInput, teamPath } from './shared.js';

export const listTeamMembers = defineTool({
  name: 'forge_list_team_members',
  title: 'List team members',
  description: 'List the members of a team with their role, or get one with `user`.',
  toolset: 'teams',
  operations: ['organizations.teams.members.index', 'organizations.teams.members.show'],
  permissions: ['team:view'],
  readOnly: true,
  notFoundHint: TEAM_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    team: teamInput,
    user: idInput('User ID of the member.').optional().describe('Return only this member.'),
    ...paginationInput,
  },
  outputSchema: {
    members: z.array(memberOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const base = `${teamPath(organization(args.organization), args.team)}/members`;
    if (args.user !== undefined) {
      const member = formatMember(await readResource(client, `${base}/${encodeURIComponent(String(args.user))}`, signal));
      return { structured: { members: [member], next_cursor: null, has_more: false }, summary: `${member.name} (${member.email}), role ${member.role_id}.` };
    }
    const response = await client.get<CollectionDocument>(base, { query: { page: { size: args.page_size, cursor: args.cursor } }, signal });
    const page = flattenCollection(response.data);
    const members = page.items.map(formatMember);
    return {
      structured: { members, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary: members.length === 0 ? 'The team has no members.' : `Found ${members.length} member(s): ${members.map((m) => m.email).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
