import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT, serverPath } from '../servers/shared.js';
import { readPhpSetting } from './settings.js';

const CHECK_WITH = 'forge_get_php_settings';

export const updatePhpLimits = defineTool({
  name: 'forge_update_php_limits',
  title: 'Update PHP limits',
  description: 'Change the max upload size and/or max execution time of every PHP version on the server. PHP-FPM is reloaded.',
  toolset: 'servers',
  operations: [
    'organizations.servers.php.max-upload-size.update',
    'organizations.servers.php.max-execution-time.update',
    'organizations.servers.php.max-upload-size.show',
    'organizations.servers.php.max-execution-time.show',
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
    max_upload_size: z.number().int().min(1).optional().describe('Max upload size in MB.'),
    max_execution_time: z.number().int().min(1).optional().describe('Max execution time in seconds.'),
    ...waitInput(120),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    if (args.max_upload_size === undefined && args.max_execution_time === undefined) {
      throw new ToolInputError('Pass `max_upload_size` and/or `max_execution_time`.');
    }
    const org = organization(args.organization);
    const base = `${serverPath(org, args.server)}/php`;
    if (args.max_upload_size !== undefined) {
      await client.put(`${base}/max-upload-size`, { body: { max_upload_size: args.max_upload_size }, signal });
    }
    if (args.max_execution_time !== undefined) {
      await client.put(`${base}/max-execution-time`, { body: { max_execution_time: args.max_execution_time }, signal });
    }
    const action = 'update the PHP limits';
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: async () => ({
        upload: args.max_upload_size === undefined ? undefined : (await readPhpSetting(client, org, args.server, 'max-upload-size', signal)).max_upload_size,
        execution:
          args.max_execution_time === undefined ? undefined : (await readPhpSetting(client, org, args.server, 'max-execution-time', signal)).max_execution_time,
      }),
      phase: (current) =>
        (args.max_upload_size === undefined || current.upload === args.max_upload_size) &&
        (args.max_execution_time === undefined || current.execution === args.max_execution_time)
          ? 'completed'
          : 'pending',
      describe: () => 'Waiting for the PHP limits to be applied',
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
