import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { idInput, organizationInput } from '../shared/schemas.js';
import { rolesPath } from './shared.js';

export const deleteRole = defineTool({
  name: 'forge_delete_role',
  title: 'Delete role',
  description: 'Delete a custom role.',
  toolset: 'teams',
  operations: ['organizations.roles.destroy'],
  permissions: ['organization:manage'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  notFoundHint: 'Check the role ID with forge_list_roles.',
  inputSchema: {
    organization: organizationInput,
    role: idInput('Custom role ID. Use forge_list_roles.'),
  },
  outputSchema: {
    deleted: z.boolean(),
  },
  async handler(args, { client, organization, signal }) {
    await client.delete(`${rolesPath(organization(args.organization))}/${encodeURIComponent(String(args.role))}`, { signal });
    return { structured: { deleted: true }, summary: `Deleted role ${args.role}.` };
  },
});
