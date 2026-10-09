import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { readResource } from '../shared/read.js';
import { organizationInput } from '../shared/schemas.js';
import { formatTeam, membersBody, membersInput, TEAM_NOT_FOUND_HINT, teamInput, teamOutput, teamPath } from './shared.js';

export const updateTeam = defineTool({
  name: 'forge_update_team',
  title: 'Update team',
  description: 'Rename a team and/or replace its members. `members` replaces the whole list: include everyone who should stay.',
  toolset: 'teams',
  operations: ['organizations.teams.update', 'organizations.teams.show'],
  permissions: ['team:create', 'team:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  notFoundHint: TEAM_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    team: teamInput,
    name: z.string().min(1).max(255).optional().describe('New name.'),
    members: membersInput.optional().describe('Every member of the team, with their role (replaces the list).'),
  },
  outputSchema: {
    team: teamOutput,
  },
  async handler(args, { client, organization, signal }) {
    if (args.name === undefined && args.members === undefined) throw new ToolInputError('Pass `name` and/or `members`.');
    const path = teamPath(organization(args.organization), args.team);
    // The name is required by the API: keep the current one when only members change.
    const name = args.name ?? (await readResource(client, path, signal)).name;
    const response = await client.put<SingleDocument>(path, {
      body: { name, users: args.members ? membersBody(args.members) : undefined },
      signal,
    });
    const team = formatTeam(flattenSingle(response.data));
    return { structured: { team }, summary: `Updated team ${team.name}.` };
  },
});
