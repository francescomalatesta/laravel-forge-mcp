import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { phpConfigInput, poolUserInput, readPhpConfig } from './config-files.js';
import { phpVersionRefInput, phpVersionsPath, resolvePhpVersionId } from './shared.js';

const CHECK_WITH = 'forge_get_php_config';

export const updatePhpConfig = defineTool({
  name: 'forge_update_php_config',
  title: 'Replace PHP configuration file',
  description:
    'Replace a whole configuration file of an installed PHP version (FPM or CLI php.ini, or the FPM pool) and reload PHP. Read it first with forge_get_php_config and send the complete new file: an invalid file can stop PHP-FPM and every site using it.',
  toolset: 'servers',
  operations: [
    'organizations.servers.php.versions.configs.fpm.update',
    'organizations.servers.php.versions.configs.cli.update',
    'organizations.servers.php.versions.configs.pool.update',
    'organizations.servers.php.versions.configs.fpm.show',
    'organizations.servers.php.versions.configs.cli.show',
    'organizations.servers.php.versions.configs.pool.show',
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
    config: phpConfigInput,
    content: z.string().min(1).describe('The complete new configuration file.'),
    user: poolUserInput,
    ...waitInput(120),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const org = organization(args.organization);
    const id = await resolvePhpVersionId(client, org, args.server, args.php_version, signal);
    const path = `${phpVersionsPath(org, args.server)}/${encodeURIComponent(id)}/configs/${args.config}`;
    const user = args.config === 'pool' ? args.user : undefined;
    await client.put(path, { body: { config: args.content, ...(user ? { user } : {}) }, signal });
    const action = `update the ${args.config} configuration`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => readPhpConfig(client, path, user, signal),
      phase: (content) => (content.trimEnd() === args.content.trimEnd() ? 'completed' : 'pending'),
      describe: () => `Waiting for the ${args.config} configuration to be applied`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, {
      action,
      checkWith: CHECK_WITH,
      timeoutSeconds: args.timeout_seconds,
      detail: result.status === 'in_progress' ? 'If PHP rejected the file, check forge_list_server_events.' : undefined,
    });
  },
});
