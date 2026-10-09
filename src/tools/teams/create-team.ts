import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { organizationInput } from '../shared/schemas.js';
import { formatTeam, membersBody, membersInput, roleIdInput, teamOutput, teamsPath } from './shared.js';

export const createTeam = defineTool({
  name: 'forge_create_team',
  title: 'Create team',
  description: 'Create a team with existing organization users and/or email invitations. Share servers, recipes and credentials with it using forge_share_with_team.',
  toolset: 'teams',
  operations: ['organizations.teams.store'],
  permissions: ['team:create'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  inputSchema: {
    organization: organizationInput,
    name: z.string().min(1).max(255).describe('Team name.'),
    members: membersInput.optional(),
    invites: z
      .array(z.object({ email: z.string().email(), role: roleIdInput.optional() }))
      .optional()
      .describe('People to invite by email, with their role.'),
  },
  outputSchema: {
    team: teamOutput,
  },
  async handler(args, { client, organization, signal }) {
    const response = await client.post<SingleDocument>(teamsPath(organization(args.organization)), {
      body: {
        name: args.name,
        users: args.members ? membersBody(args.members) : undefined,
        invites: args.invites?.map((invite) => ({ email: invite.email, ...(invite.role === undefined ? {} : { role: { id: Number(invite.role) } }) })),
      },
      signal,
    });
    const team = formatTeam(flattenSingle(response.data));
    return { structured: { team }, summary: `Created team ${team.name} (ID ${team.id}).` };
  },
});
