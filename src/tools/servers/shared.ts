import type { ForgeClient } from '../../forge/client.js';
import { flattenCollection, flattenSingle, type CollectionDocument, type FlatResource, type SingleDocument } from '../../forge/jsonapi.js';
import { apiPath } from '../../forge/path.js';

export function serverPath(org: string, server: string | number): string {
  return apiPath`/orgs/${org}/servers/${server}`;
}

export const SERVER_NOT_FOUND_HINT = 'Check the server ID with forge_list_servers.';

export async function readServer(client: ForgeClient, org: string, server: string | number, signal: AbortSignal): Promise<FlatResource> {
  const response = await client.get<SingleDocument>(serverPath(org, server), { signal });
  return flattenSingle(response.data);
}

/** IDs of the archived servers on the first page (most recently updated first). */
export async function archivedServerIds(client: ForgeClient, org: string, signal: AbortSignal): Promise<Set<string>> {
  const response = await client.get<CollectionDocument>(apiPath`/orgs/${org}/servers/archives`, {
    query: { sort: ['-updated_at'], page: { size: 100 } },
    signal,
  });
  return new Set(flattenCollection(response.data).items.map((server) => server.id));
}
