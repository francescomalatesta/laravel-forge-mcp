import type { ForgeClient } from '../../forge/client.js';
import { flattenCollection, flattenSingle, type CollectionDocument, type FlatResource, type SingleDocument } from '../../forge/jsonapi.js';

/** Reads a single JSON:API resource and flattens it. */
export async function readResource(client: ForgeClient, path: string, signal: AbortSignal): Promise<FlatResource> {
  const response = await client.get<SingleDocument>(path, { signal });
  return flattenSingle(response.data);
}

/**
 * First page (100 items) of a collection, used to spot the item created by a
 * write that returns no body: remember the IDs before, find the new one after.
 * `sortable`: the endpoint accepts `sort=-created_at` (Forge rejects sorts an
 * endpoint does not declare), so the newest items come first.
 */
export async function listRecent(
  client: ForgeClient,
  path: string,
  signal: AbortSignal,
  options: { sortable: boolean; filter?: Record<string, string | undefined> },
): Promise<FlatResource[]> {
  const response = await client.get<CollectionDocument>(path, {
    query: { filter: options.filter, sort: options.sortable ? ['-created_at'] : undefined, page: { size: 100 } },
    signal,
  });
  return flattenCollection(response.data).items;
}

/** Returns the first item whose ID is not in `known`, or null. */
export function findNew(items: FlatResource[], known: ReadonlySet<string>): FlatResource | null {
  return items.find((item) => !known.has(item.id)) ?? null;
}
