import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { readResource } from '../shared/read.js';
import { idInput, organizationInput } from '../shared/schemas.js';
import { formatRole, permissionsInput, roleOutput, rolesPath } from './shared.js';

export const updateRole = defineTool({
  name: 'forge_update_role',
  title: 'Update role',
  description: 'Rename a custom role, change its description or replace its permissions. Every member with the role is affected.',
  toolset: 'teams',
  operations: ['organizations.roles.update', 'organizations.roles.show'],
  permissions: ['organization:manage', 'organization:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  notFoundHint: 'Check the role ID with forge_list_roles.',
  inputSchema: {
    organization: organizationInput,
    role: idInput('Custom role ID. Use forge_list_roles.'),
    name: z.string().min(1).max(50).optional().describe('New name.'),
    description: z.string().min(1).optional(),
    permissions: permissionsInput.optional().describe('Every permission of the role (replaces the list).'),
  },
  outputSchema: {
    role: roleOutput,
  },
  async handler(args, { client, organization, signal }) {
    if (args.name === undefined && args.description === undefined && args.permissions === undefined) {
      throw new ToolInputError('Pass `name`, `description` and/or `permissions`.');
    }
    const path = `${rolesPath(organization(args.organization))}/${encodeURIComponent(String(args.role))}`;
    // The name is required by the API: keep the current one when it does not change.
    const name = args.name ?? (await readResource(client, path, signal)).name;
    const response = await client.put<SingleDocument>(path, {
      body: { name, description: args.description, permissions: args.permissions },
      signal,
    });
    const role = formatRole(flattenSingle(response.data));
    return { structured: { role }, summary: `Updated role ${role.name}.` };
  },
});
