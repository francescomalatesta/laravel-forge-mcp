import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { PHP_VERSIONS } from '../sites/shared.js';
import { findPhpVersion, phpVersionOutput, phpVersionPhase, phpVersionsPath, versionNumber } from './shared.js';

const CHECK_WITH = 'forge_list_php_versions';

export const installPhpVersion = defineTool({
  name: 'forge_install_php_version',
  title: 'Install PHP version',
  description:
    'Install another PHP version on a server, optionally making it the default for the CLI and/or new sites. Waits until it is installed unless `wait` is false.',
  toolset: 'servers',
  operations: ['organizations.servers.php.versions.store', 'organizations.servers.php.versions.index'],
  permissions: ['server:manage-php', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    version: z.enum(PHP_VERSIONS).describe('Version to install, e.g. "php84".'),
    cli_default: z.boolean().optional().describe('Make it the version used by the `php` command.'),
    site_default: z.boolean().optional().describe('Make it the default for new sites.'),
    ...waitInput(300),
  },
  outputSchema: {
    ...operationOutput,
    php_version: phpVersionOutput.nullable(),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const org = organization(args.organization);
    await client.post(phpVersionsPath(org, args.server), {
      body: { version: args.version, cli_default: args.cli_default, site_default: args.site_default },
      signal,
    });
    const action = `install ${args.version}`;
    const number = versionNumber(args.version);
    if (!args.wait || !number) {
      const accepted = queued(action, CHECK_WITH);
      return { ...accepted, structured: { ...accepted.structured, php_version: null } };
    }

    // Forge returns no body: follow the version once it appears in the list.
    const result = await waitFor({
      poll: () => findPhpVersion(client, org, args.server, number, signal).then((found) => found ?? null),
      phase: (found) => (found ? phpVersionPhase(found.status) : 'pending'),
      describe: (found) => `PHP ${number} is ${found?.status ?? 'queued'}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
    return { structured: { ...done.structured, php_version: result.value ?? null }, summary: done.summary };
  },
});

