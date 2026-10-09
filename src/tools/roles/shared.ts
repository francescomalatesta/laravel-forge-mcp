import { z } from 'zod';
import { apiPath } from '../../forge/path.js';
import { pick } from '../shared/schemas.js';

export function rolesPath(org: string): string {
  return apiPath`/orgs/${org}/roles`;
}

export const permissionsInput = z
  .array(z.string().regex(/^[a-z-]+:[a-z-]+$/, 'Permissions look like "server:view"; list them with forge_list_permissions.'))
  .describe('Permission names, e.g. ["server:view", "site:manage-deploys"]. Use forge_list_permissions to find them.');

export const roleOutput = z.looseObject({
  id: z.string().describe('Use it as `role` in team tools.'),
  name: z.string().nullable(),
  permissions: z.array(z.string()).nullable().describe('Permission names (or IDs when names are not available); null when not requested.'),
  created_at: z.string().nullable(),
});

export type RoleOutput = z.output<typeof roleOutput>;

/** Permissions are a to-many relationship: names when included, IDs otherwise. */
export function formatRole(flat: Record<string, unknown>): RoleOutput {
  const related = flat.permissions as Array<{ id?: unknown; name?: unknown }> | undefined;
  return {
    ...(pick(flat, ['id', 'name', 'created_at']) as { id: string; name: string | null; created_at: string | null }),
    permissions: Array.isArray(related) ? related.map((permission) => String(permission.name ?? permission.id)) : null,
  };
}
