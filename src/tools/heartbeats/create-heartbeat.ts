import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput } from '../shared/site-scope.js';
import { REDACTED } from '../shared/secrets.js';
import { cronInput, formatHeartbeat, frequencyInput, gracePeriodInput, heartbeatOutput, heartbeatsPath, scheduleBody } from './shared.js';

export const createHeartbeat = defineTool({
  name: 'forge_create_heartbeat',
  title: 'Create heartbeat',
  description:
    'Create a heartbeat: Forge alerts when the job does not request its ping URL on schedule (e.g. `->thenPing($url)` on a Laravel scheduled task). Pass `frequency` or `cron`.',
  toolset: 'monitoring',
  operations: ['organizations.servers.sites.heartbeats.store'],
  permissions: ['site:manage-heartbeats'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    name: z.string().min(1).max(255).describe('Name, e.g. "Nightly reports".'),
    frequency: frequencyInput.optional(),
    cron: cronInput.optional(),
    grace_period: gracePeriodInput.default(5),
  },
  outputSchema: {
    heartbeat: heartbeatOutput,
  },
  async handler(args, { client, config, organization, signal }) {
    const response = await client.post<SingleDocument>(heartbeatsPath(organization(args.organization), args.server, args.site), {
      body: { name: args.name, grace_period: args.grace_period, ...scheduleBody(args.frequency, args.cron) },
      signal,
    });
    const heartbeat = formatHeartbeat(flattenSingle(response.data), config.allowSecrets);
    return {
      structured: { heartbeat },
      summary: `Created heartbeat ${heartbeat.name} (ID ${heartbeat.id}).${
        heartbeat.ping_url === REDACTED ? ' Its ping URL is hidden: enable FORGE_ALLOW_SECRETS or copy it from the Forge dashboard.' : ` Ping URL: ${heartbeat.ping_url}`
      }`,
    };
  },
});
