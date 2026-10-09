import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { apiPath } from '../../forge/path.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { idInput, organizationInput, paginationInput, paginationOutput, paginationSummary, pick } from '../shared/schemas.js';
import { rolesPath } from './shared.js';

const permissionOutput = z.looseObject({ id: z.string(), name: z.string().nullable().describe('e.g. "server:view".') });

export const listPermissions = defineTool({
  name: 'forge_list_permissions',
  title: 'List permissions',
  description:
    'List every permission a role can grant (e.g. "server:view", "site:manage-deploys"), or the permissions of one custom role with `role`. Get one by ID with `permission`.',
  toolset: 'teams',
  operations: ['permissions.index', 'permissions.show', 'organizations.roles.permissions.index'],
  permissions: ['organization:view'],
  readOnly: true,
  notFoundHint: 'Check the role ID with forge_list_roles.',
  inputSchema: {
    organization: organizationInput,
    role: idInput('Custom role ID. Use forge_list_roles.').optional().describe('Only the permissions of this custom role.'),
    permission: idInput('Permission ID.').optional().describe('Return only this permission.'),
    name: z.string().min(1).optional().describe('Filter by name.'),
    ...paginationInput,
  },
  outputSchema: {
    permissions: z.array(permissionOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const format = (flat: Record<string, unknown>) => pick(flat, ['id', 'name']) as z.output<typeof permissionOutput>;
    if (args.permission !== undefined) {
      const permission = format(await readResource(client, apiPath`/permissions/${args.permission}`, signal));
      return { structured: { permissions: [permission], next_cursor: null, has_more: false }, summary: `Permission ${permission.name}.` };
    }
    const base =
      args.role === undefined ? '/permissions' : `${rolesPath(organization(args.organization))}/${encodeURIComponent(String(args.role))}/permissions`;
    const response = await client.get<CollectionDocument>(base, {
      query: { filter: { name: args.name }, page: { size: args.page_size, cursor: args.cursor } },
      signal,
    });
    const page = flattenCollection(response.data);
    const permissions = page.items.map(format);
    return {
      structured: { permissions, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary: `Found ${permissions.length} permission(s): ${permissions.map((p) => p.name).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
