import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { paginationInput, paginationOutput, paginationSummary } from '../shared/schemas.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput } from '../shared/site-scope.js';
import { formatHeartbeat, heartbeatInput, heartbeatOutput, heartbeatsPath } from './shared.js';

export const listHeartbeats = defineTool({
  name: 'forge_list_heartbeats',
  title: 'List heartbeats',
  description:
    'List the heartbeats of a site (scheduled tasks that must ping Forge regularly) with their status: missing means the job stopped running. Get one with `heartbeat`.',
  toolset: 'monitoring',
  operations: ['organizations.servers.sites.heartbeats.index', 'organizations.servers.sites.heartbeats.show'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    heartbeat: heartbeatInput.optional().describe('Return only this heartbeat.'),
    ...paginationInput,
  },
  outputSchema: {
    heartbeats: z.array(heartbeatOutput),
    ...paginationOutput,
  },
  async handler(args, { client, config, organization, signal }) {
    const base = heartbeatsPath(organization(args.organization), args.server, args.site);
    const format = (flat: Record<string, unknown>) => formatHeartbeat(flat, config.allowSecrets);
    if (args.heartbeat !== undefined) {
      const heartbeat = format(await readResource(client, `${base}/${encodeURIComponent(String(args.heartbeat))}`, signal));
      return { structured: { heartbeats: [heartbeat], next_cursor: null, has_more: false }, summary: `Heartbeat ${heartbeat.name} is ${heartbeat.status}.` };
    }
    const response = await client.get<CollectionDocument>(base, { query: { page: { size: args.page_size, cursor: args.cursor } }, signal });
    const page = flattenCollection(response.data);
    const heartbeats = page.items.map(format);
    const missing = heartbeats.filter((heartbeat) => heartbeat.status === 'missing');
    return {
      structured: { heartbeats, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        heartbeats.length === 0
          ? 'No heartbeats found.'
          : `Found ${heartbeats.length} heartbeat(s)${missing.length > 0 ? `; missing: ${missing.map((h) => h.name).join(', ')}` : ''}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
