import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { siteScopeInput } from '../shared/site-scope.js';
import { HEARTBEAT_NOT_FOUND_HINT, heartbeatInput, heartbeatsPath } from './shared.js';

export const deleteHeartbeat = defineTool({
  name: 'forge_delete_heartbeat',
  title: 'Delete heartbeat',
  description: 'Delete a heartbeat: Forge stops alerting when the job does not ping.',
  toolset: 'monitoring',
  operations: ['organizations.servers.sites.heartbeats.destroy'],
  permissions: ['site:manage-heartbeats'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  notFoundHint: HEARTBEAT_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    heartbeat: heartbeatInput,
  },
  outputSchema: {
    deleted: z.boolean(),
  },
  async handler(args, { client, organization, signal }) {
    await client.delete(`${heartbeatsPath(organization(args.organization), args.server, args.site)}/${encodeURIComponent(String(args.heartbeat))}`, {
      signal,
    });
    return { structured: { deleted: true }, summary: `Deleted heartbeat ${args.heartbeat}.` };
  },
});
