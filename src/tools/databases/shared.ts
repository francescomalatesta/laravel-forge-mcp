import { z } from 'zod';
import type { ForgeClient } from '../../forge/client.js';
import { flattenCollection, flattenSingle, type CollectionDocument, type FlatResource, type SingleDocument } from '../../forge/jsonapi.js';
import { ToolInputError } from '../errors.js';
import { phaseOf, type Phase } from '../shared/async.js';
import { idInput, pick } from '../shared/schemas.js';
import { serverPath } from '../servers/shared.js';

export function databasesPath(org: string, server: string | number): string {
  return `${serverPath(org, server)}/database/schemas`;
}

export function databaseUsersPath(org: string, server: string | number): string {
  return `${serverPath(org, server)}/database/users`;
}

export const databaseInput = idInput('Database ID. Use forge_list_databases to find it.');
export const databaseUserInput = idInput('Database user ID. Use forge_list_database_users to find it.');

export const databaseRefsInput = z
  .array(z.union([z.number().int().nonnegative(), z.string().min(1)]))
  .describe('Databases by ID or by name, e.g. [12, "shop"].');

export const passwordInput = z.string().min(8).describe('Password (never returned by any tool).');

const FIELDS = ['id', 'name', 'status', 'created_at', 'updated_at'] as const;

export const databaseOutput = z.looseObject({
  id: z.string(),
  name: z.string().nullable(),
  status: z.string().nullable().describe('installing, installed, removing (users also: updating).'),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type DatabaseOutput = z.output<typeof databaseOutput>;

export function formatDatabase(flat: Record<string, unknown>): DatabaseOutput {
  return pick(flat, FIELDS) as DatabaseOutput;
}

export async function readOne(client: ForgeClient, path: string, signal: AbortSignal): Promise<FlatResource> {
  const response = await client.get<SingleDocument>(path, { signal });
  return flattenSingle(response.data);
}

/** Databases and database users share the same transitional statuses. */
export function databasePhase(status: unknown): Phase {
  return phaseOf(status, { pending: ['installing', 'updating', 'removing'] });
}

/** Resolves database IDs or names to IDs, failing with the names that do not exist. */
export async function resolveDatabaseIds(
  client: ForgeClient,
  org: string,
  server: string | number,
  refs: readonly (string | number)[],
  signal: AbortSignal,
): Promise<number[]> {
  const ids: number[] = [];
  const missing: string[] = [];
  for (const ref of refs) {
    if (typeof ref === 'number' || /^\d+$/.test(ref)) {
      ids.push(Number(ref));
      continue;
    }
    const response = await client.get<CollectionDocument>(databasesPath(org, server), {
      query: { filter: { name: ref }, page: { size: 100 } },
      signal,
    });
    const match = flattenCollection(response.data).items.find((database) => database.name === ref);
    if (match) ids.push(Number(match.id));
    else missing.push(ref);
  }
  if (missing.length > 0) {
    throw new ToolInputError(`Database(s) not found on server ${server}: ${missing.join(', ')}. Check the names with forge_list_databases.`);
  }
  return ids;
}
