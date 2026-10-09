import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { idInput, organizationInput } from '../shared/schemas.js';
import { formatMember, memberOutput, roleIdInput, teamInput, teamPath } from './shared.js';

export const updateTeamMember = defineTool({
  name: 'forge_update_team_member',
  title: 'Update team member',
  description: "Change a team member's role (what they can do on the team's servers).",
  toolset: 'teams',
  operations: ['organizations.teams.members.update'],
  permissions: ['team:create'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  notFoundHint: 'Check the team with forge_list_teams and the member with forge_list_team_members.',
  inputSchema: {
    organization: organizationInput,
    team: teamInput,
    user: idInput('User ID of the member. Use forge_list_team_members.'),
    role: roleIdInput,
  },
  outputSchema: {
    member: memberOutput,
  },
  async handler(args, { client, organization, signal }) {
    const response = await client.put<SingleDocument>(
      `${teamPath(organization(args.organization), args.team)}/members/${encodeURIComponent(String(args.user))}`,
      { body: { role_id: Number(args.role) }, signal },
    );
    const member = formatMember(flattenSingle(response.data));
    return { structured: { member }, summary: `${member.name} now has role ${member.role_id}.` };
  },
});
