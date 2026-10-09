import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { operationOutput } from '../shared/async.js';
import { organizationInput } from '../shared/schemas.js';
import { formatInvitation, invitationOutput, roleIdInput, TEAM_NOT_FOUND_HINT, teamInput, teamPath } from './shared.js';

export const inviteTeamMember = defineTool({
  name: 'forge_invite_team_member',
  title: 'Invite team member',
  description: 'Invite someone to a team by email, with a role. Forge emails the invitation; it stays pending until accepted.',
  toolset: 'teams',
  operations: ['organizations.teams.invites.store'],
  permissions: ['team:create'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  notFoundHint: TEAM_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    team: teamInput,
    email: z.string().email().describe('Email to invite.'),
    role: roleIdInput,
  },
  outputSchema: {
    ...operationOutput,
    invitation: invitationOutput.nullable(),
  },
  async handler(args, { client, organization, signal }) {
    const response = await client.post<SingleDocument | undefined>(`${teamPath(organization(args.organization), args.team)}/invites`, {
      body: { email: args.email, role_id: Number(args.role) },
      signal,
    });
    // The response already contains the invitation; Forge sends the email in the background.
    const invitation = response.data?.data ? formatInvitation(flattenSingle(response.data)) : null;
    return {
      structured: { status: invitation ? ('completed' as const) : ('queued' as const), check_with: 'forge_list_team_invitations', invitation },
      summary: `Invited ${args.email} to team ${args.team}${invitation ? ` (invitation ${invitation.id})` : ''}.`,
    };
  },
});
