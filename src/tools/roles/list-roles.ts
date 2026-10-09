import { z } from 'zod';
import { flattenCollection, flattenSingle, type CollectionDocument, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { idInput, organizationInput, paginationInput, paginationOutput, paginationSummary } from '../shared/schemas.js';
import { formatRole, roleOutput, rolesPath } from './shared.js';

export const listRoles = defineTool({
  name: 'forge_list_roles',
  title: 'List roles',
  description:
    "List the roles that can be given to team members: the organization's custom roles, or Forge's predefined ones with `scope: \"predefined\"`. Pass `role` to get one.",
  toolset: 'teams',
  operations: ['organizations.roles.index', 'organizations.roles.show', 'predefined-roles.index', 'predefined-roles.show'],
  permissions: ['organization:view'],
  readOnly: true,
  notFoundHint: 'Check the role ID with forge_list_roles (and the `scope`).',
  inputSchema: {
    organization: organizationInput,
    scope: z.enum(['organization', 'predefined']).default('organization').describe('organization: custom roles; predefined: roles provided by Forge.'),
    role: idInput('Role ID.').optional().describe('Return only this role.'),
    name: z.string().min(1).optional().describe('Filter by name.'),
    permission: z.string().min(1).optional().describe('Only roles that have this permission, e.g. "server:delete".'),
    include_permissions: z.boolean().default(false).describe('Also return the permissions of every role.'),
    ...paginationInput,
  },
  outputSchema: {
    roles: z.array(roleOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const base = args.scope === 'predefined' ? '/predefined-roles' : rolesPath(organization(args.organization));
    if (args.role !== undefined) {
      const response = await client.get<SingleDocument>(`${base}/${encodeURIComponent(String(args.role))}`, { signal });
      const role = formatRole(flattenSingle(response.data));
      return {
        structured: { roles: [role], next_cursor: null, has_more: false },
        summary: `Role ${role.name}.${args.scope === 'organization' ? ' List its permissions by name with forge_list_permissions and `role`.' : ''}`,
      };
    }
    const response = await client.get<CollectionDocument>(base, {
      query: {
        filter: { name: args.name, 'permissions.name': args.permission },
        include: args.include_permissions ? ['permissions'] : undefined,
        page: { size: args.page_size, cursor: args.cursor },
      },
      signal,
    });
    const page = flattenCollection(response.data);
    const roles = page.items.map((item) => {
      const role = formatRole(item);
      return args.include_permissions ? role : { ...role, permissions: null };
    });
    return {
      structured: { roles, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary: roles.length === 0 ? 'No roles found.' : `Found ${roles.length} role(s): ${roles.map((r) => `${r.name} (${r.id})`).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
