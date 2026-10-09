import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { phpConfigInput, poolUserInput, readPhpConfig } from './config-files.js';
import { phpVersionRefInput, phpVersionsPath, resolvePhpVersionId } from './shared.js';

export const getPhpConfig = defineTool({
  name: 'forge_get_php_config',
  title: 'Get PHP configuration file',
  description: 'Read a configuration file of an installed PHP version: the FPM or CLI php.ini, or the PHP-FPM pool configuration.',
  toolset: 'servers',
  operations: [
    'organizations.servers.php.versions.configs.fpm.show',
    'organizations.servers.php.versions.configs.cli.show',
    'organizations.servers.php.versions.configs.pool.show',
    'organizations.servers.php.versions.index',
  ],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    php_version: phpVersionRefInput,
    config: phpConfigInput,
    user: poolUserInput,
  },
  outputSchema: {
    content: z.string().describe('Content of the configuration file.'),
  },
  async handler(args, { client, organization, signal }) {
    const org = organization(args.organization);
    const id = await resolvePhpVersionId(client, org, args.server, args.php_version, signal);
    const path = `${phpVersionsPath(org, args.server)}/${encodeURIComponent(id)}/configs/${args.config}`;
    const content = await readPhpConfig(client, path, args.config === 'pool' ? args.user : undefined, signal);
    return { structured: { content }, summary: `The ${args.config} configuration has ${content.trimEnd().split('\n').length} line(s).` };
  },
});
