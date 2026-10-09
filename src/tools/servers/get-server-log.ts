import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { organizationInput, serverInput, tail } from '../shared/schemas.js';
import { serverLogKeyInput } from './server-logs.js';
import { serverPath } from './shared.js';

export const getServerLog = defineTool({
  name: 'forge_get_server_log',
  title: 'Get server log',
  description: 'Read the end of a server-level log (Nginx, PHP-FPM, MySQL, cron, daemons). For site logs use forge_get_site_log.',
  toolset: 'servers',
  operations: ['organizations.servers.logs.show'],
  permissions: ['server:manage-logs'],
  readOnly: true,
  notFoundHint: 'Check the server ID with forge_list_servers; the log key may not exist on this server (the service may not be installed).',
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    key: serverLogKeyInput,
    lines: z.number().int().min(0).max(5000).default(100).describe('Return only the last N lines (0 = everything Forge returns).'),
  },
  outputSchema: {
    key: z.string(),
    content: z.string(),
    truncated: z.boolean(),
    total_lines: z.number().int(),
  },
  async handler(args, { client, organization, signal }) {
    const path = `${serverPath(organization(args.organization), args.server)}/logs/${encodeURIComponent(args.key)}`;
    const response = await client.get<SingleDocument>(path, { signal });
    const output = tail(flattenSingle(response.data).content as string | null | undefined, args.lines);
    return {
      structured: { key: args.key, content: output.text, truncated: output.truncated, total_lines: output.total_lines },
      summary:
        output.total_lines === 0
          ? `The ${args.key} log is empty.`
          : `${args.key} log: ${output.truncated ? `last ${args.lines} of ${output.total_lines}` : output.total_lines} line(s).`,
    };
  },
});
