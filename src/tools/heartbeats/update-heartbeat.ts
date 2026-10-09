import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { readResource } from '../shared/read.js';
import { siteScopeInput } from '../shared/site-scope.js';
import {
  cronInput,
  formatHeartbeat,
  frequencyInput,
  gracePeriodInput,
  HEARTBEAT_NOT_FOUND_HINT,
  heartbeatInput,
  heartbeatOutput,
  heartbeatsPath,
  scheduleBody,
} from './shared.js';

export const updateHeartbeat = defineTool({
  name: 'forge_update_heartbeat',
  title: 'Update heartbeat',
  description: 'Change the name, schedule (`frequency` or `cron`) or grace period of a heartbeat. Fields not passed keep their value.',
  toolset: 'monitoring',
  operations: ['organizations.servers.sites.heartbeats.update', 'organizations.servers.sites.heartbeats.show'],
  permissions: ['site:manage-heartbeats', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  notFoundHint: HEARTBEAT_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    heartbeat: heartbeatInput,
    name: z.string().min(1).max(255).optional().describe('New name.'),
    frequency: frequencyInput.optional(),
    cron: cronInput.optional(),
    grace_period: gracePeriodInput.optional(),
  },
  outputSchema: {
    heartbeat: heartbeatOutput,
  },
  async handler(args, { client, config, organization, signal }) {
    if (args.name === undefined && args.frequency === undefined && args.cron === undefined && args.grace_period === undefined) {
      throw new ToolInputError('Pass at least one setting to change.');
    }
    const path = `${heartbeatsPath(organization(args.organization), args.server, args.site)}/${encodeURIComponent(String(args.heartbeat))}`;
    const current = await readResource(client, path, signal);
    const schedule =
      args.frequency !== undefined || args.cron !== undefined
        ? scheduleBody(args.frequency, args.cron)
        : current.frequency === -1
          ? { frequency: -1, custom_frequency: current.custom_frequency }
          : { frequency: current.frequency };
    const response = await client.put<SingleDocument>(path, {
      body: { name: args.name ?? current.name, grace_period: args.grace_period ?? current.grace_period, ...schedule },
      signal,
    });
    const heartbeat = formatHeartbeat(flattenSingle(response.data), config.allowSecrets);
    return { structured: { heartbeat }, summary: `Updated heartbeat ${heartbeat.name}.` };
  },
});
