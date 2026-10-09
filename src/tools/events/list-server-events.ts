import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { apiPath } from '../../forge/path.js';
import { defineTool } from '../define-tool.js';
import { idInput, organizationInput, paginationInput, paginationOutput, paginationSummary } from '../shared/schemas.js';
import { eventOutput, formatEvent } from './format.js';

const SORT_VALUES = ['created_at', '-created_at', 'updated_at', '-updated_at'] as const;

export const listServerEvents = defineTool({
  name: 'forge_list_server_events',
  title: 'List server events',
  description:
    'List recent events (operations Forge ran: provisioning, deployments, configuration changes, service restarts, ...) for one server or, without `server`, across the whole organization. Use it to follow the outcome of operations that Forge queued in the background, then read an event output with forge_get_server_event.',
  toolset: 'core',
  operations: ['organizations.servers.events.index', 'organizations.events.index'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: 'Check the server ID with forge_list_servers.',
  inputSchema: {
    organization: organizationInput,
    server: idInput('Only list events of this server. Omit to list events across the organization.').optional(),
    initiated_by: z.string().min(1).optional().describe('Filter by the user ID who triggered the event.'),
    ran_as: z.string().min(1).optional().describe('Filter by the server user the event ran as, e.g. "forge".'),
    sort: z
      .array(z.enum(SORT_VALUES))
      .min(1)
      .optional()
      .describe('Sort order, e.g. ["-created_at"] for the most recent first.'),
    ...paginationInput,
  },
  outputSchema: {
    events: z.array(eventOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const org = organization(args.organization);
    const path = args.server === undefined ? apiPath`/orgs/${org}/events` : apiPath`/orgs/${org}/servers/${args.server}/events`;
    const response = await client.get<CollectionDocument>(path, {
      query: {
        filter: { initiated_by: args.initiated_by, ran_as: args.ran_as },
        sort: args.sort,
        include: ['initiator', 'site'],
        page: { size: args.page_size, cursor: args.cursor },
      },
      signal,
    });
    const page = flattenCollection(response.data);
    const events = page.items.map(formatEvent);
    const scope = args.server === undefined ? `organization "${org}"` : `server ${args.server}`;
    const next = args.server === undefined ? '' : ' Read an event output with forge_get_server_event.';

    return {
      structured: { events, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        events.length === 0
          ? `No events found for ${scope}.`
          : `Found ${events.length} event(s) for ${scope}.${next}${paginationSummary(page.nextCursor)}`,
    };
  },
});
