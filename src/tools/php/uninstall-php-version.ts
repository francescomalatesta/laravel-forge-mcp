import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { phpVersionRefInput, phpVersionsPath, resolvePhpVersionId } from './shared.js';

const CHECK_WITH = 'forge_list_php_versions';

export const uninstallPhpVersion = defineTool({
  name: 'forge_uninstall_php_version',
  title: 'Uninstall PHP version',
  description: 'Uninstall a PHP version from a server. Sites still using it stop working: move them first with forge_update_site.',
  toolset: 'servers',
  operations: [
    'organizations.servers.php.versions.destroy',
    'organizations.servers.php.versions.show',
    'organizations.servers.php.versions.index',
  ],
  permissions: ['server:manage-php', 'server:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    php_version: phpVersionRefInput,
    ...waitInput(180),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const org = organization(args.organization);
    const id = await resolvePhpVersionId(client, org, args.server, args.php_version, signal);
    const path = `${phpVersionsPath(org, args.server)}/${encodeURIComponent(id)}`;
    await client.delete(path, { signal });
    const action = `uninstall PHP ${args.php_version}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => orGone(async () => flattenSingle((await client.get<SingleDocument>(path, { signal })).data)),
      phase: (version) => (version === null ? 'completed' : 'pending'),
      describe: (version) => `PHP ${args.php_version} is ${version?.status ?? 'removing'}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
