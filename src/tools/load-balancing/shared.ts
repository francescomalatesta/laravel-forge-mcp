import { z } from 'zod';
import type { ForgeClient } from '../../forge/client.js';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { sitePath } from '../shared/site-scope.js';

export function nodesPath(org: string, server: string | number, site: string | number): string {
  return `${sitePath(org, server, site)}/load-balancing-nodes`;
}

export const nodeOutput = z.looseObject({
  server_id: z.string().nullable().describe('Server receiving traffic.'),
  port: z.number().nullable(),
  weight: z.number().nullable().describe('Relative share of traffic.'),
  backup: z.boolean().nullable().describe('Only used when the other servers are unavailable.'),
  down: z.boolean().nullable().describe('Out of rotation.'),
});

export type NodeOutput = z.output<typeof nodeOutput>;

export function formatNode(flat: Record<string, unknown>): NodeOutput {
  return {
    server_id: flat.server_id === undefined || flat.server_id === null ? null : String(flat.server_id),
    port: (flat.port as number | undefined) ?? null,
    weight: (flat.weight as number | undefined) ?? null,
    backup: (flat.backup as boolean | undefined) ?? null,
    down: (flat.down as boolean | undefined) ?? null,
  };
}

/** Every node of the load balancer (one page of 100 covers any realistic pool). */
export async function readNodes(client: ForgeClient, path: string, signal: AbortSignal): Promise<NodeOutput[]> {
  const response = await client.get<CollectionDocument>(path, { query: { page: { size: 100 } }, signal });
  return flattenCollection(response.data).items.map(formatNode);
}
