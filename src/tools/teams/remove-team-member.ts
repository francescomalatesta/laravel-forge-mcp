import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { idInput, organizationInput } from '../shared/schemas.js';
import { teamInput, teamPath } from './shared.js';

export const removeTeamMember = defineTool({
  name: 'forge_remove_team_member',
  title: 'Remove team member',
  description: 'Remove a member from a team: they lose the access the team gave them.',
  toolset: 'teams',
  operations: ['organizations.teams.members.destroy'],
  permissions: ['team:delete'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  notFoundHint: 'Check the team with forge_list_teams and the member with forge_list_team_members.',
  inputSchema: {
    organization: organizationInput,
    team: teamInput,
    user: idInput('User ID of the member. Use forge_list_team_members.'),
  },
  outputSchema: {
    removed: z.boolean(),
  },
  async handler(args, { client, organization, signal }) {
    await client.delete(`${teamPath(organization(args.organization), args.team)}/members/${encodeURIComponent(String(args.user))}`, { signal });
    return { structured: { removed: true }, summary: `Removed user ${args.user} from team ${args.team}.` };
  },
});
