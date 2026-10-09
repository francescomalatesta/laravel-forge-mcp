import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { organizationInput, paginationInput, paginationOutput, paginationSummary, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { formatMonitor, MONITOR_TYPES, monitorInput, monitorOutput, monitorsPath } from './shared.js';

const SORT = ['state', '-state', 'status', '-status', 'created_at', '-created_at', 'updated_at', '-updated_at'] as const;

export const listMonitors = defineTool({
  name: 'forge_list_monitors',
  title: 'List monitors',
  description:
    'List the resource monitors of a server (CPU load, disk, memory thresholds) and whether they are in ALERT, or get one with `monitor`.',
  toolset: 'monitoring',
  operations: ['organizations.servers.monitors.index', 'organizations.servers.monitors.show'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    monitor: monitorInput.optional().describe('Return only this monitor.'),
    state: z.enum(['OK', 'ALERT', 'UNKNOWN']).optional().describe('Filter by state.'),
    type: z.enum(MONITOR_TYPES).optional().describe('Filter by metric.'),
    status: z.string().min(1).optional().describe('Filter by installation status.'),
    notify: z.string().min(1).optional().describe('Filter by notified email.'),
    sort: z.array(z.enum(SORT)).min(1).optional(),
    ...paginationInput,
  },
  outputSchema: {
    monitors: z.array(monitorOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const base = monitorsPath(organization(args.organization), args.server);
    if (args.monitor !== undefined) {
      const monitor = formatMonitor(await readResource(client, `${base}/${encodeURIComponent(String(args.monitor))}`, signal));
      return { structured: { monitors: [monitor], next_cursor: null, has_more: false }, summary: `Monitor ${monitor.type} is ${monitor.state}.` };
    }
    const response = await client.get<CollectionDocument>(base, {
      query: {
        filter: { state: args.state, type: args.type, status: args.status, notify: args.notify },
        sort: args.sort,
        page: { size: args.page_size, cursor: args.cursor },
      },
      signal,
    });
    const page = flattenCollection(response.data);
    const monitors = page.items.map(formatMonitor);
    const alerting = monitors.filter((monitor) => monitor.state === 'ALERT');
    return {
      structured: { monitors, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        monitors.length === 0
          ? 'No monitors found.'
          : `Found ${monitors.length} monitor(s)${
              alerting.length > 0 ? `; in ALERT: ${alerting.map((m) => `${m.type} ${m.operator} ${m.threshold} (${m.id})`).join(', ')}` : ', none in alert'
            }.${paginationSummary(page.nextCursor)}`,
    };
  },
});
