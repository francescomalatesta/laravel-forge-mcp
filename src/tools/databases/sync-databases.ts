import { defineTool } from '../define-tool.js';
import { operationOutput, queued } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { databasesPath } from './shared.js';

export const syncDatabases = defineTool({
  name: 'forge_sync_databases',
  title: 'Synchronize databases',
  description: 'Make Forge pick up databases created outside Forge (e.g. from a SQL client), so they can be managed and backed up.',
  toolset: 'databases',
  operations: ['organizations.servers.database.schemas.synchronizations.store'],
  permissions: ['server:create-databases'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal }) {
    await client.post(`${databasesPath(organization(args.organization), args.server)}/synchronizations`, { signal });
    // Which databases will appear is unknown in advance, so there is nothing to wait for.
    return queued('synchronize the databases', 'forge_list_databases');
  },
});
