import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { organizationInput, paginationInput, paginationOutput, paginationSummary, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { databaseInput, databaseOutput, databasesPath, formatDatabase, readOne } from './shared.js';

const SORT = ['name', '-name', 'created_at', '-created_at', 'updated_at', '-updated_at'] as const;

export const listDatabases = defineTool({
  name: 'forge_list_databases',
  title: 'List databases',
  description: 'List the database schemas on a server (MySQL, MariaDB or Postgres), or get one with `database`.',
  toolset: 'databases',
  operations: ['organizations.servers.database.schemas.index', 'organizations.servers.database.schemas.show'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    database: databaseInput.optional().describe('Return only this database.'),
    name: z.string().min(1).optional().describe('Filter by name.'),
    status: z.string().min(1).optional().describe('Filter by status, e.g. "installed".'),
    sort: z.array(z.enum(SORT)).min(1).optional(),
    ...paginationInput,
  },
  outputSchema: {
    databases: z.array(databaseOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const base = databasesPath(organization(args.organization), args.server);
    if (args.database !== undefined) {
      const database = formatDatabase(await readOne(client, `${base}/${encodeURIComponent(String(args.database))}`, signal));
      return { structured: { databases: [database], next_cursor: null, has_more: false }, summary: `Database ${database.name} is ${database.status}.` };
    }
    const response = await client.get<CollectionDocument>(base, {
      query: { filter: { name: args.name, status: args.status }, sort: args.sort, page: { size: args.page_size, cursor: args.cursor } },
      signal,
    });
    const page = flattenCollection(response.data);
    const databases = page.items.map(formatDatabase);
    return {
      structured: { databases, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        databases.length === 0
          ? 'No databases found.'
          : `Found ${databases.length} database(s): ${databases.map((d) => d.name).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
