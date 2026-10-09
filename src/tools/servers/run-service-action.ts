import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { operationOutput, queued } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { PHP_VERSIONS } from '../sites/shared.js';
import { SERVER_NOT_FOUND_HINT, serverPath } from './shared.js';

/** Actions each service endpoint accepts, from the spec. */
const SERVICE_ACTIONS = {
  nginx: ['reboot', 'stop'],
  mysql: ['reboot', 'stop'],
  postgres: ['reboot', 'stop'],
  redis: ['reboot'],
  supervisor: ['reboot'],
  php: ['reboot', 'reload'],
} as const;

type Service = keyof typeof SERVICE_ACTIONS;

export const runServiceAction = defineTool({
  name: 'forge_run_service_action',
  title: 'Restart, reload or stop a service',
  description: [
    'Run an action on a service of the server.',
    '"reboot" restarts it (nginx, mysql, postgres, redis, supervisor, php);',
    '"stop" stops it (nginx, mysql, postgres);',
    '"reload" gracefully reloads PHP-FPM (php).',
    'For php, pass `php_version`. Restarting a service briefly interrupts the sites that use it.',
  ].join(' '),
  toolset: 'servers',
  operations: [
    'organizations.servers.services.nginx.actions.store',
    'organizations.servers.services.mysql.actions.store',
    'organizations.servers.services.postgres.actions.store',
    'organizations.servers.services.redis.actions.store',
    'organizations.servers.services.supervisor.actions.store',
    'organizations.servers.services.php.actions.store',
  ],
  permissions: ['server:manage-services'],
  readOnly: false,
  destructive: true,
  idempotent: false,
  async: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    service: z.enum(Object.keys(SERVICE_ACTIONS) as [Service, ...Service[]]),
    action: z.enum(['reboot', 'stop', 'reload']).default('reboot'),
    php_version: z.enum(PHP_VERSIONS).optional().describe('PHP version whose FPM to act on (required for php), e.g. "php83".'),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal }) {
    const allowed: readonly string[] = SERVICE_ACTIONS[args.service];
    if (!allowed.includes(args.action)) {
      throw new ToolInputError(`${args.service} supports: ${allowed.join(', ')}.`);
    }
    if (args.service === 'php' && !args.php_version) {
      throw new ToolInputError('Pass `php_version` (e.g. "php83") to act on PHP-FPM. The server PHP versions are in forge_get_server.');
    }

    await client.post(`${serverPath(organization(args.organization), args.server)}/services/${args.service}/actions`, {
      body: { action: args.action, ...(args.service === 'php' ? { version: args.php_version } : {}) },
      signal,
    });
    const target = args.service === 'php' ? `${args.php_version} FPM` : args.service;
    // Service state is not exposed by the API: the server events record the outcome.
    return queued(`${args.action} ${target}`, 'forge_list_server_events', `(server ${args.server})`);
  },
});
