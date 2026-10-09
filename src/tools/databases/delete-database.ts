import { defineTool } from '../define-tool.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { databaseInput, databasesPath, readOne } from './shared.js';

const CHECK_WITH = 'forge_list_databases';

export const deleteDatabase = defineTool({
  name: 'forge_delete_database',
  title: 'Delete database',
  description: 'Drop a database schema from the server with all its data. This cannot be undone: make sure a backup exists.',
  toolset: 'databases',
  operations: ['organizations.servers.database.schemas.destroy', 'organizations.servers.database.schemas.show'],
  permissions: ['server:delete-databases', 'server:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: 'Check the database ID with forge_list_databases.',
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    database: databaseInput,
    ...waitInput(120),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = `${databasesPath(organization(args.organization), args.server)}/${encodeURIComponent(String(args.database))}`;
    await client.delete(path, { signal });
    const action = `delete database ${args.database}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => orGone(() => readOne(client, path, signal)),
      phase: (database) => (database === null ? 'completed' : 'pending'),
      describe: (database) => `Database is ${database?.status ?? 'removing'}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
