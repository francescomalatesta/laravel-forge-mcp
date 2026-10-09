import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { operationOutput, queued } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { databaseRefsInput, databaseUserInput, databaseUsersPath, passwordInput, resolveDatabaseIds } from './shared.js';

export const updateDatabaseUser = defineTool({
  name: 'forge_update_database_user',
  title: 'Update database user',
  description:
    "Change a database user's password and/or the databases it can access. `databases` replaces the whole list (by ID or name): include the ones it should keep.",
  toolset: 'databases',
  operations: ['organizations.servers.database.users.update', 'organizations.servers.database.schemas.index'],
  permissions: ['server:create-databases', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: 'Check the user ID with forge_list_database_users.',
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    user: databaseUserInput,
    password: passwordInput.optional().describe('New password (never returned).'),
    databases: databaseRefsInput.optional().describe('Every database the user should access, by ID or name (replaces the list).'),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal }) {
    if (args.password === undefined && args.databases === undefined) {
      throw new ToolInputError('Pass `password` and/or `databases`.');
    }
    const org = organization(args.organization);
    const databaseIds = args.databases ? await resolveDatabaseIds(client, org, args.server, args.databases, signal) : undefined;
    await client.put(`${databaseUsersPath(org, args.server)}/${encodeURIComponent(String(args.user))}`, {
      body: { password: args.password, database_ids: databaseIds },
      signal,
    });
    // Neither passwords nor granted databases are exposed by the API: nothing to verify.
    return queued(`update database user ${args.user}`, 'forge_list_database_users', '(the status shows "updating" while it runs)');
  },
});
