import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, waitFor, waitInput } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import {
  databaseOutput,
  databasePhase,
  databaseRefsInput,
  databaseUsersPath,
  formatDatabase,
  passwordInput,
  readOne,
  resolveDatabaseIds,
} from './shared.js';

const CHECK_WITH = 'forge_list_database_users';

export const createDatabaseUser = defineTool({
  name: 'forge_create_database_user',
  title: 'Create database user',
  description:
    'Create a database user, optionally with access to some databases (by ID or name) and read-only. Waits until it is installed unless `wait` is false.',
  toolset: 'databases',
  operations: [
    'organizations.servers.database.users.store',
    'organizations.servers.database.users.show',
    'organizations.servers.database.schemas.index',
  ],
  permissions: ['server:create-databases', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    name: z.string().min(1).describe('User name.'),
    password: passwordInput,
    databases: databaseRefsInput.optional(),
    read_only: z.boolean().optional().describe('Grant read-only access.'),
    ...waitInput(120),
  },
  outputSchema: {
    ...operationOutput,
    user: databaseOutput.nullable(),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const org = organization(args.organization);
    const databaseIds = args.databases ? await resolveDatabaseIds(client, org, args.server, args.databases, signal) : undefined;
    const base = databaseUsersPath(org, args.server);
    const response = await client.post<SingleDocument | undefined>(base, {
      body: { name: args.name, password: args.password, database_ids: databaseIds, read_only: args.read_only },
      signal,
    });
    const initial = response.data?.data ? flattenSingle(response.data) : undefined;
    const action = `create the database user ${args.name}`;
    if (!initial || !args.wait) {
      return {
        structured: { status: 'queued' as const, check_with: CHECK_WITH, user: initial ? formatDatabase(initial) : null },
        summary: `Forge accepted the request to ${action}. Check it with ${CHECK_WITH}.`,
      };
    }

    const result = await waitFor({
      initial,
      poll: () => readOne(client, `${base}/${encodeURIComponent(initial.id)}`, signal),
      phase: (user) => databasePhase(user.status),
      describe: (user) => `Database user ${user.name} is ${user.status}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
    return { structured: { ...done.structured, user: formatDatabase(result.value ?? initial) }, summary: done.summary };
  },
});
