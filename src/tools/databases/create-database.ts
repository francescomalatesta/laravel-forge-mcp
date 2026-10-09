import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { operationOutput, outcome, waitFor, waitInput } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { databaseOutput, databasePhase, databasesPath, formatDatabase, passwordInput, readOne } from './shared.js';

const CHECK_WITH = 'forge_list_databases';

export const createDatabase = defineTool({
  name: 'forge_create_database',
  title: 'Create database',
  description:
    'Create a database schema on a server, optionally with a new user that has access to it (`user` + `password`). Waits until it is installed unless `wait` is false. Connect it to a site by setting DB_* variables with forge_set_site_env_vars.',
  toolset: 'databases',
  operations: ['organizations.servers.database.schemas.store', 'organizations.servers.database.schemas.show'],
  permissions: ['server:create-databases', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    name: z.string().min(1).describe('Database name.'),
    user: z.string().min(1).optional().describe('Also create a user with access to this database.'),
    password: passwordInput.optional().describe('Password of the new user (required with `user`, never returned).'),
    backup_configuration_ids: z.array(z.number().int()).optional().describe('Backup configurations to add the database to.'),
    ...waitInput(120),
  },
  outputSchema: {
    ...operationOutput,
    database: databaseOutput.nullable(),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    if (Boolean(args.user) !== Boolean(args.password)) {
      throw new ToolInputError('Pass both `user` and `password` to create a user with the database, or neither.');
    }
    const base = databasesPath(organization(args.organization), args.server);
    const response = await client.post<SingleDocument | undefined>(base, {
      body: { name: args.name, user: args.user, password: args.password, backup_configuration_ids: args.backup_configuration_ids },
      signal,
    });
    const initial = response.data?.data ? flattenSingle(response.data) : undefined;
    const action = `create the database ${args.name}${args.user ? ` with user ${args.user}` : ''}`;
    if (!initial || !args.wait) {
      return {
        structured: { status: 'queued' as const, check_with: CHECK_WITH, database: initial ? formatDatabase(initial) : null },
        summary: `Forge accepted the request to ${action}. Check it with ${CHECK_WITH}.`,
      };
    }

    const result = await waitFor({
      initial,
      poll: () => readOne(client, `${base}/${encodeURIComponent(initial.id)}`, signal),
      phase: (database) => databasePhase(database.status),
      describe: (database) => `Database ${database.name} is ${database.status}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
    return { structured: { ...done.structured, database: formatDatabase(result.value ?? initial) }, summary: done.summary };
  },
});
