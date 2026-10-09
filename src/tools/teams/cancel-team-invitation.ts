import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { idInput, organizationInput } from '../shared/schemas.js';
import { teamInput, teamPath } from './shared.js';

export const cancelTeamInvitation = defineTool({
  name: 'forge_cancel_team_invitation',
  title: 'Cancel team invitation',
  description: 'Cancel a pending team invitation.',
  toolset: 'teams',
  operations: ['organizations.teams.invites.destroy'],
  permissions: ['team:delete'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  notFoundHint: 'Check the invitation with forge_list_team_invitations.',
  inputSchema: {
    organization: organizationInput,
    team: teamInput,
    invitation: idInput('Invitation ID. Use forge_list_team_invitations.'),
  },
  outputSchema: {
    cancelled: z.boolean(),
  },
  async handler(args, { client, organization, signal }) {
    await client.delete(`${teamPath(organization(args.organization), args.team)}/invites/${encodeURIComponent(String(args.invitation))}`, { signal });
    return { structured: { cancelled: true }, summary: `Cancelled invitation ${args.invitation}.` };
  },
});
