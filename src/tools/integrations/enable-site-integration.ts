import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput } from '../shared/site-scope.js';
import {
  describeIntegration,
  INTEGRATION_NAMES,
  INTEGRATIONS_DESCRIPTION,
  integrationOperation,
  integrationOutput,
  integrationPath,
  readIntegration,
  type IntegrationName,
} from './shared.js';

const CHECK_WITH = 'forge_get_site_integrations';
const TRANSITIONS = ['enabling', 'disabling'];

/** Inputs each integration accepts; any other integration-specific input is rejected. */
const ALLOWED: Record<IntegrationName, readonly string[]> = {
  horizon: [],
  octane: ['octane_server', 'port'],
  reverb: ['host', 'port', 'connections'],
  pulse: [],
  inertia: [],
  scheduler: [],
  maintenance: ['maintenance_status', 'maintenance_secret', 'maintenance_redirect'],
};
const SPECIFIC = ['octane_server', 'port', 'host', 'connections', 'maintenance_status', 'maintenance_secret', 'maintenance_redirect'] as const;

export const enableSiteIntegration = defineTool({
  name: 'forge_enable_site_integration',
  title: 'Enable site integration',
  description: `Enable a Laravel integration on a site: ${INTEGRATIONS_DESCRIPTION} Forge creates the daemon or scheduled job it needs. Octane needs \`octane_server\` and \`port\`; Reverb needs \`host\`, \`port\` and \`connections\`; maintenance mode accepts a bypass secret and a redirect. Waits until the integration is enabled unless \`wait\` is false.`,
  toolset: 'integrations',
  operations: [...INTEGRATION_NAMES.map((name) => integrationOperation(name, 'store')), ...INTEGRATION_NAMES.map((name) => integrationOperation(name, 'show'))],
  permissions: ['server:create-daemons', 'server:create-schedulers', 'site:manage-commands', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    integration: z.enum(INTEGRATION_NAMES).describe('Integration to enable.'),
    octane_server: z.enum(['swoole', 'roadrunner', 'frankenphp']).optional().describe('Octane only: application server.'),
    port: z.number().int().min(1).max(65535).optional().describe('Octane and Reverb: port the server listens on, e.g. 8000 or 8080.'),
    host: z.string().min(1).optional().describe('Reverb only: public host name of the WebSocket server, e.g. "ws.example.com".'),
    connections: z.number().int().min(1).max(50000).optional().describe('Reverb only: maximum concurrent connections.'),
    maintenance_status: z
      .union([z.literal(503), z.literal(410), z.literal(307), z.literal(304)])
      .optional()
      .describe('Maintenance only: HTTP status returned while down (default 503).'),
    maintenance_secret: z.string().min(1).optional().describe('Maintenance only: secret path that bypasses maintenance mode (https://site/{secret}).'),
    maintenance_redirect: z.string().min(1).optional().describe('Maintenance only: path or URL every request is redirected to.'),
    ...waitInput(90),
  },
  outputSchema: {
    ...operationOutput,
    integration: integrationOutput.nullable().describe('State after the wait.'),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const { integration } = args;
    const unexpected = SPECIFIC.filter((field) => args[field] !== undefined && !ALLOWED[integration].includes(field));
    if (unexpected.length > 0) throw new ToolInputError(`${unexpected.map((f) => `\`${f}\``).join(', ')} not used by ${integration}.`);

    let body: Record<string, unknown> | undefined;
    if (integration === 'octane') {
      if (!args.octane_server || args.port === undefined) throw new ToolInputError('Octane needs `octane_server` and `port`.');
      body = { server: args.octane_server, port: String(args.port) };
    } else if (integration === 'reverb') {
      if (!args.host || args.port === undefined || args.connections === undefined) {
        throw new ToolInputError('Reverb needs `host`, `port` and `connections`.');
      }
      body = { host: args.host, port: String(args.port), connections: args.connections };
    } else if (integration === 'maintenance') {
      body = { status: args.maintenance_status ?? 503, secret: args.maintenance_secret, redirect: args.maintenance_redirect };
    }

    const path = integrationPath(organization(args.organization), args.server, args.site, integration);
    await client.post(path, { body, signal });
    const action = `enable ${integration}`;
    if (!args.wait) {
      const accepted = queued(action, CHECK_WITH);
      return { ...accepted, structured: { ...accepted.structured, integration: null } };
    }

    const result = await waitFor({
      poll: () => readIntegration(client, path, integration, signal),
      phase: (state) => (state.enabled === true && !TRANSITIONS.includes(state.status ?? '') ? 'completed' : 'pending'),
      describe: describeIntegration,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
    return { structured: { ...done.structured, integration: result.value ?? null }, summary: done.summary };
  },
});
