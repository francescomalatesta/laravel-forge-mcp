import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { idInput, organizationInput } from '../shared/schemas.js';
import { SHAREABLE, shareableInput, sharingOperations } from './sharing.js';
import { TEAM_NOT_FOUND_HINT, teamInput, teamPath } from './shared.js';

export const shareWithTeam = defineTool({
  name: 'forge_share_with_team',
  title: 'Share with team',
  description: "Give a team access to a server, a recipe or a provider credential. Members act on it according to their role.",
  toolset: 'teams',
  operations: sharingOperations('store'),
  permissions: ['server:view', 'team:create', 'recipe:view', 'recipe:manage', 'credential:manage', 'credential:view'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  notFoundHint: TEAM_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    team: teamInput,
    resource: shareableInput,
    id: idInput('ID of the server, recipe or credential to share.'),
  },
  outputSchema: {
    shared: z.boolean(),
  },
  async handler(args, { client, organization, signal }) {
    const { segment, field } = SHAREABLE[args.resource];
    await client.post(`${teamPath(organization(args.organization), args.team)}/${segment}`, { body: { [field]: Number(args.id) }, signal });
    return { structured: { shared: true }, summary: `Shared ${args.resource.replace(/s$/, '')} ${args.id} with team ${args.team}.` };
  },
});
