import { defineTool } from '../define-tool.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { databaseUserInput, databaseUsersPath, readOne } from './shared.js';

const CHECK_WITH = 'forge_list_database_users';

export const deleteDatabaseUser = defineTool({
  name: 'forge_delete_database_user',
  title: 'Delete database user',
  description: 'Delete a database user. Applications connecting with it lose database access.',
  toolset: 'databases',
  operations: ['organizations.servers.database.users.destroy', 'organizations.servers.database.users.show'],
  permissions: ['server:delete-databases', 'server:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: 'Check the user ID with forge_list_database_users.',
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    user: databaseUserInput,
    ...waitInput(120),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = `${databaseUsersPath(organization(args.organization), args.server)}/${encodeURIComponent(String(args.user))}`;
    await client.delete(path, { signal });
    const action = `delete database user ${args.user}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => orGone(() => readOne(client, path, signal)),
      phase: (user) => (user === null ? 'completed' : 'pending'),
      describe: (user) => `Database user is ${user?.status ?? 'removing'}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
