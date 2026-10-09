import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { organizationInput, paginationInput, paginationOutput, paginationSummary, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { databaseOutput, databaseUserInput, databaseUsersPath, formatDatabase, readOne } from './shared.js';

const SORT = ['name', '-name', 'created_at', '-created_at', 'updated_at', '-updated_at'] as const;

export const listDatabaseUsers = defineTool({
  name: 'forge_list_database_users',
  title: 'List database users',
  description: 'List the database users on a server, or get one with `user`. Passwords and granted databases are not exposed by Forge.',
  toolset: 'databases',
  operations: ['organizations.servers.database.users.index', 'organizations.servers.database.users.show'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    user: databaseUserInput.optional().describe('Return only this user.'),
    name: z.string().min(1).optional().describe('Filter by name.'),
    status: z.string().min(1).optional().describe('Filter by status, e.g. "installed".'),
    sort: z.array(z.enum(SORT)).min(1).optional(),
    ...paginationInput,
  },
  outputSchema: {
    users: z.array(databaseOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const base = databaseUsersPath(organization(args.organization), args.server);
    if (args.user !== undefined) {
      const user = formatDatabase(await readOne(client, `${base}/${encodeURIComponent(String(args.user))}`, signal));
      return { structured: { users: [user], next_cursor: null, has_more: false }, summary: `Database user ${user.name} is ${user.status}.` };
    }
    const response = await client.get<CollectionDocument>(base, {
      query: { filter: { name: args.name, status: args.status }, sort: args.sort, page: { size: args.page_size, cursor: args.cursor } },
      signal,
    });
    const page = flattenCollection(response.data);
    const users = page.items.map(formatDatabase);
    return {
      structured: { users, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        users.length === 0
          ? 'No database users found.'
          : `Found ${users.length} database user(s): ${users.map((u) => u.name).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
