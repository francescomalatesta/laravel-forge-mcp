import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { organizationInput } from '../shared/schemas.js';
import { TEAM_NOT_FOUND_HINT, teamInput, teamPath } from './shared.js';

export const deleteTeam = defineTool({
  name: 'forge_delete_team',
  title: 'Delete team',
  description: 'Delete a team: its members lose the access the team gave them.',
  toolset: 'teams',
  operations: ['organizations.teams.destroy'],
  permissions: ['team:delete'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  notFoundHint: TEAM_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    team: teamInput,
  },
  outputSchema: {
    deleted: z.boolean(),
  },
  async handler(args, { client, organization, signal }) {
    await client.delete(teamPath(organization(args.organization), args.team), { signal });
    return { structured: { deleted: true }, summary: `Deleted team ${args.team}.` };
  },
});
