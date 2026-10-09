import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { idInput, organizationInput, paginationInput, paginationOutput, paginationSummary } from '../shared/schemas.js';
import { formatInvitation, invitationOutput, TEAM_NOT_FOUND_HINT, teamInput, teamPath } from './shared.js';

export const listTeamInvitations = defineTool({
  name: 'forge_list_team_invitations',
  title: 'List team invitations',
  description: 'List the pending invitations of a team, or get one with `invitation`.',
  toolset: 'teams',
  operations: ['organizations.teams.invites.index', 'organizations.teams.invites.show'],
  permissions: ['team:view'],
  readOnly: true,
  notFoundHint: TEAM_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    team: teamInput,
    invitation: idInput('Invitation ID.').optional().describe('Return only this invitation.'),
    ...paginationInput,
  },
  outputSchema: {
    invitations: z.array(invitationOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const base = `${teamPath(organization(args.organization), args.team)}/invites`;
    if (args.invitation !== undefined) {
      const invitation = formatInvitation(await readResource(client, `${base}/${encodeURIComponent(String(args.invitation))}`, signal));
      return { structured: { invitations: [invitation], next_cursor: null, has_more: false }, summary: `Invitation for ${invitation.email}.` };
    }
    const response = await client.get<CollectionDocument>(base, { query: { page: { size: args.page_size, cursor: args.cursor } }, signal });
    const page = flattenCollection(response.data);
    const invitations = page.items.map(formatInvitation);
    return {
      structured: { invitations, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        invitations.length === 0 ? 'No pending invitations.' : `Pending invitations: ${invitations.map((i) => i.email).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
