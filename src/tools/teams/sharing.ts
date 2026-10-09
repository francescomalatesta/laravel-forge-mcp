import { z } from 'zod';

/** What can be shared with a team: path segment, request field and operationId segment. */
export const SHAREABLE = {
  servers: { segment: 'servers', field: 'server_id', operation: 'servers' },
  recipes: { segment: 'recipes', field: 'recipe_id', operation: 'recipes' },
  credentials: { segment: 'server-credentials', field: 'credential_id', operation: 'server-credentials' },
} as const;

export type Shareable = keyof typeof SHAREABLE;
export const SHAREABLE_NAMES = Object.keys(SHAREABLE) as [Shareable, ...Shareable[]];

export const shareableInput = z
  .enum(SHAREABLE_NAMES)
  .describe('servers, recipes or credentials (cloud provider accounts used to create servers).');

export function sharingOperations(verb: 'index' | 'store' | 'destroy'): string[] {
  return SHAREABLE_NAMES.map((name) => `organizations.teams.${SHAREABLE[name].operation}.${verb}`);
}

export const sharedItemOutput = z.looseObject({
  id: z.string(),
  name: z.string().nullable(),
});
