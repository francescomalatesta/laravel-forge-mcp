import { z } from 'zod';
import { pick } from '../shared/schemas.js';

/** Fields returned in "concise" mode: enough to identify and pick a server. */
export const SERVER_CONCISE_FIELDS = [
  'id',
  'name',
  'type',
  'provider',
  'region',
  'size',
  'ip_address',
  'php_version',
  'database_type',
  'is_ready',
  'connection_status',
] as const;

export const serverOutput = z.looseObject({
  id: z.string().describe('Server ID, used as the `server` argument of other tools.'),
  name: z.string().nullable(),
  type: z.string().nullable().describe('app, web, loadbalancer, database, cache, worker, meilisearch, ...'),
  provider: z.string().nullable(),
  region: z.string().nullable(),
  size: z.string().nullable(),
  ip_address: z.string().nullable(),
  php_version: z.string().nullable(),
  database_type: z.string().nullable(),
  is_ready: z.boolean().nullable(),
  connection_status: z.string().nullable(),
});

export type ServerOutput = z.output<typeof serverOutput>;

export function formatServer(flat: Record<string, unknown>, detailed: boolean): ServerOutput {
  return (detailed ? { ...pick(flat, SERVER_CONCISE_FIELDS), ...flat } : pick(flat, SERVER_CONCISE_FIELDS)) as ServerOutput;
}
