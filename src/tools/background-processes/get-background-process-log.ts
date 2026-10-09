import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { organizationInput, serverInput, tail } from '../shared/schemas.js';
import { BACKGROUND_PROCESS_NOT_FOUND_HINT, backgroundProcessInput, backgroundProcessPath } from './shared.js';

export const getBackgroundProcessLog = defineTool({
  name: 'forge_get_background_process_log',
  title: 'Get background process log',
  description: 'Read the end of the log of a background process (what the worker printed, crash traces). Empty it with forge_run_background_process_action.',
  toolset: 'jobs',
  operations: ['organizations.servers.background-processes.log.show'],
  permissions: ['server:create-daemons'],
  readOnly: true,
  notFoundHint: BACKGROUND_PROCESS_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    background_process: backgroundProcessInput,
    lines: z.number().int().min(0).max(5000).default(100).describe('Return only the last N lines (0 = whole log).'),
  },
  outputSchema: {
    log: z.string(),
    truncated: z.boolean(),
    total_lines: z.number().int(),
  },
  async handler(args, { client, organization, signal }) {
    const path = `${backgroundProcessPath(organization(args.organization), args.server, args.background_process)}/log`;
    const log = tail((await readResource(client, path, signal)).content as string | null | undefined, args.lines);
    return {
      structured: { log: log.text, truncated: log.truncated, total_lines: log.total_lines },
      summary: log.total_lines === 0 ? 'The log is empty.' : `Showing ${log.truncated ? `the last ${args.lines} of ` : ''}${log.total_lines} line(s).`,
    };
  },
});
