import { defineTool } from '../define-tool.js';
import { operationOutput, queued } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { phpVersionRefInput, phpVersionsPath, resolvePhpVersionId } from './shared.js';

export const upgradePhpVersion = defineTool({
  name: 'forge_upgrade_php_version',
  title: 'Upgrade PHP to the latest patch release',
  description: 'Update an installed PHP version to its latest patch release (e.g. 8.3.x). PHP-FPM restarts during the update.',
  toolset: 'servers',
  operations: ['organizations.servers.php.versions.update', 'organizations.servers.php.versions.index'],
  permissions: ['server:manage-php', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    php_version: phpVersionRefInput,
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal }) {
    const org = organization(args.organization);
    const id = await resolvePhpVersionId(client, org, args.server, args.php_version, signal);
    await client.put(`${phpVersionsPath(org, args.server)}/${encodeURIComponent(id)}`, { signal });
    // The patch level is not exposed by the API: the server events record the outcome.
    return queued(`upgrade PHP ${args.php_version}`, 'forge_list_server_events', `(server ${args.server})`);
  },
});
