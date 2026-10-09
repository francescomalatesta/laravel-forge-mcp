import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { readPhpSetting } from './settings.js';

export const getPhpSettings = defineTool({
  name: 'forge_get_php_settings',
  title: 'Get PHP settings',
  description:
    "Get a server's PHP settings in one call: default CLI version, default version for new sites, max upload size, max execution time and whether OPcache is enabled.",
  toolset: 'servers',
  operations: [
    'organizations.servers.php.cli-version.show',
    'organizations.servers.php.site-version.show',
    'organizations.servers.php.max-upload-size.show',
    'organizations.servers.php.max-execution-time.show',
    'organizations.servers.php.opcache.show',
  ],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
  },
  outputSchema: {
    cli_version: z.string().nullable().describe('Version used by the `php` command, e.g. "8.3".'),
    site_version: z.string().nullable().describe('Default version for new sites.'),
    max_upload_size: z.number().nullable().describe('Max upload size in MB.'),
    max_execution_time: z.number().nullable().describe('Max execution time in seconds.'),
    opcache_enabled: z.boolean().nullable(),
  },
  async handler(args, { client, organization, signal }) {
    const org = organization(args.organization);
    const read = (name: Parameters<typeof readPhpSetting>[3]) => readPhpSetting(client, org, args.server, name, signal);
    const [cli, site, upload, execution, opcache] = await Promise.all([
      read('cli-version'),
      read('site-version'),
      read('max-upload-size'),
      read('max-execution-time'),
      read('opcache'),
    ]);
    const settings = {
      cli_version: (cli.version as string | undefined) ?? null,
      site_version: (site.version as string | undefined) ?? null,
      max_upload_size: (upload.max_upload_size as number | null | undefined) ?? null,
      max_execution_time: (execution.max_execution_time as number | null | undefined) ?? null,
      opcache_enabled: (opcache.opcache_enabled as boolean | undefined) ?? null,
    };
    return {
      structured: settings,
      summary: `PHP CLI ${settings.cli_version}, sites ${settings.site_version}, upload ${settings.max_upload_size} MB, execution ${settings.max_execution_time}s, OPcache ${settings.opcache_enabled ? 'on' : 'off'}.`,
    };
  },
});
