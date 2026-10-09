import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { tail } from '../shared/schemas.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from '../shared/site-scope.js';
import { siteLogInput } from './logs.js';

export const getSiteLog = defineTool({
  name: 'forge_get_site_log',
  title: 'Get site log',
  description:
    'Read the end of a site log: the application log, the Nginx access log or the Nginx error log. Use it to diagnose errors after a deployment.',
  toolset: 'sites',
  operations: [
    'organizations.servers.sites.logs.application.show',
    'organizations.servers.sites.logs.nginx-access.show',
    'organizations.servers.sites.logs.nginx-error.show',
  ],
  permissions: ['server:manage-logs'],
  readOnly: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    log: siteLogInput,
    lines: z.number().int().min(0).max(5000).default(100).describe('Return only the last N lines (0 = everything Forge returns).'),
  },
  outputSchema: {
    log: z.string(),
    content: z.string().describe('Log content (last `lines` lines).'),
    truncated: z.boolean(),
    total_lines: z.number().int(),
  },
  async handler(args, { client, organization, signal }) {
    const path = `${sitePath(organization(args.organization), args.server, args.site)}/logs/${args.log}`;
    const response = await client.get<SingleDocument>(path, { signal });
    const output = tail(flattenSingle(response.data).content as string | null | undefined, args.lines);
    return {
      structured: { log: args.log, content: output.text, truncated: output.truncated, total_lines: output.total_lines },
      summary:
        output.total_lines === 0
          ? `The ${args.log} log is empty.`
          : `${args.log} log: ${output.truncated ? `last ${args.lines} of ${output.total_lines}` : output.total_lines} line(s).`,
    };
  },
});
