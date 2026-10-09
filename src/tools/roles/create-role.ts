import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { organizationInput } from '../shared/schemas.js';
import { formatRole, permissionsInput, roleOutput, rolesPath } from './shared.js';

export const createRole = defineTool({
  name: 'forge_create_role',
  title: 'Create role',
  description: 'Create a custom role with a set of permissions, to give to team members.',
  toolset: 'teams',
  operations: ['organizations.roles.store'],
  permissions: ['organization:manage'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  inputSchema: {
    organization: organizationInput,
    name: z.string().min(1).max(50).describe('Role name, e.g. "Deployer".'),
    permissions: permissionsInput.optional(),
  },
  outputSchema: {
    role: roleOutput,
  },
  async handler(args, { client, organization, signal }) {
    const response = await client.post<SingleDocument>(rolesPath(organization(args.organization)), {
      body: { name: args.name, permissions: args.permissions },
      signal,
    });
    const role = formatRole(flattenSingle(response.data));
    return { structured: { role }, summary: `Created role ${role.name} (ID ${role.id}).` };
  },
});
