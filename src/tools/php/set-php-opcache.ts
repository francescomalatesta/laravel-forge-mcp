import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT, serverPath } from '../servers/shared.js';
import { readPhpSetting } from './settings.js';

const CHECK_WITH = 'forge_get_php_settings';

export const setPhpOpcache = defineTool({
  name: 'forge_set_php_opcache',
  title: 'Enable or disable OPcache',
  description:
    'Enable or disable PHP OPcache on the server. Enabled OPcache speeds up PHP; with it, code changes are picked up only after PHP-FPM reloads (Forge deployments reload it).',
  toolset: 'servers',
  operations: [
    'organizations.servers.php.opcache.store',
    'organizations.servers.php.opcache.destroy',
    'organizations.servers.php.opcache.show',
  ],
  permissions: ['server:manage-php', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    enabled: z.boolean(),
    ...waitInput(120),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const org = organization(args.organization);
    const path = `${serverPath(org, args.server)}/php/opcache`;
    if (args.enabled) {
      await client.post(path, { signal });
    } else {
      await client.delete(path, { signal });
    }
    const action = `${args.enabled ? 'enable' : 'disable'} OPcache`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: async () => (await readPhpSetting(client, org, args.server, 'opcache', signal)).opcache_enabled,
      phase: (enabled) => (enabled === args.enabled ? 'completed' : 'pending'),
      describe: () => `Waiting for OPcache to be ${args.enabled ? 'enabled' : 'disabled'}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
