import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT, serverPath } from '../servers/shared.js';
import { readPhpSetting } from './settings.js';
import { versionNumber } from './shared.js';

const CHECK_WITH = 'forge_get_php_settings';

export const setDefaultPhpVersion = defineTool({
  name: 'forge_set_default_php_version',
  title: 'Set default PHP version',
  description:
    'Set the PHP version used by the `php` command on the server ("cli") or the default for new sites ("site"). The version must be installed (forge_list_php_versions). Existing sites keep their version: change it with forge_update_site.',
  toolset: 'servers',
  operations: [
    'organizations.servers.php.cli-version.update',
    'organizations.servers.php.site-version.update',
    'organizations.servers.php.cli-version.show',
    'organizations.servers.php.site-version.show',
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
    target: z.enum(['cli', 'site']).describe('"cli" for the `php` command, "site" for new sites.'),
    php_version: z.string().min(1).describe('Version, e.g. "8.3" or "php83".'),
    ...waitInput(120),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const number = versionNumber(args.php_version);
    if (!number) throw new ToolInputError(`Unknown PHP version "${args.php_version}": use a version like "8.3".`);
    const org = organization(args.organization);
    const setting = args.target === 'cli' ? 'cli-version' : 'site-version';
    await client.put(`${serverPath(org, args.server)}/php/${setting}`, { body: { php_version: number }, signal });
    const action = `set the default ${args.target} PHP version to ${number}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: async () => (await readPhpSetting(client, org, args.server, setting, signal)).version,
      phase: (version) => (version === number ? 'completed' : 'pending'),
      describe: (version) => `Default ${args.target} PHP version is ${version}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
