import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { idInput, organizationInput } from '../shared/schemas.js';
import { SHAREABLE, shareableInput, sharingOperations } from './sharing.js';
import { TEAM_NOT_FOUND_HINT, teamInput, teamPath } from './shared.js';

export const unshareFromTeam = defineTool({
  name: 'forge_unshare_from_team',
  title: 'Unshare from team',
  description: 'Revoke the access of a team to a server, a recipe or a provider credential.',
  toolset: 'teams',
  operations: sharingOperations('destroy'),
  permissions: ['server:view', 'team:create', 'recipe:view', 'recipe:manage', 'credential:manage', 'credential:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  notFoundHint: TEAM_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    team: teamInput,
    resource: shareableInput,
    id: idInput('ID of the server, recipe or credential.'),
  },
  outputSchema: {
    unshared: z.boolean(),
  },
  async handler(args, { client, organization, signal }) {
    await client.delete(`${teamPath(organization(args.organization), args.team)}/${SHAREABLE[args.resource].segment}/${encodeURIComponent(String(args.id))}`, {
      signal,
    });
    return { structured: { unshared: true }, summary: `Team ${args.team} no longer has access to ${args.resource.replace(/s$/, '')} ${args.id}.` };
  },
});
