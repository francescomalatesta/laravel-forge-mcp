import type { ForgeClient } from '../../forge/client.js';
import { flattenSingle, type FlatResource, type SingleDocument } from '../../forge/jsonapi.js';

/** Reads a single JSON:API resource and flattens it. */
export async function readResource(client: ForgeClient, path: string, signal: AbortSignal): Promise<FlatResource> {
  const response = await client.get<SingleDocument>(path, { signal });
  return flattenSingle(response.data);
}
