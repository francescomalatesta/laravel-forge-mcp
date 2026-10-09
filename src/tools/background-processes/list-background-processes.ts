import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { idInput, organizationInput, paginationInput, paginationOutput, paginationSummary, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import {
  backgroundProcessInput,
  backgroundProcessOutput,
  backgroundProcessPath,
  backgroundProcessesPath,
  formatBackgroundProcess,
} from './shared.js';

export const listBackgroundProcesses = defineTool({
  name: 'forge_list_background_processes',
  title: 'List background processes',
  description:
    'List the background processes (Supervisor daemons such as queue workers, Horizon or Reverb) on a server with their status, or get one with `background_process`. Filter by site, user or directory.',
  toolset: 'jobs',
  operations: ['organizations.servers.background-processes.index', 'organizations.servers.background-processes.show'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    background_process: backgroundProcessInput.optional().describe('Return only this background process.'),
    site: idInput('Only processes of this site.').optional(),
    user: z.string().min(1).optional().describe('Only processes running as this user.'),
    directory: z.string().min(1).optional().describe('Only processes running in this directory.'),
    sort: z.array(z.enum(['user', '-user'])).min(1).optional(),
    ...paginationInput,
  },
  outputSchema: {
    background_processes: z.array(backgroundProcessOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const org = organization(args.organization);
    if (args.background_process !== undefined) {
      const process = formatBackgroundProcess(await readResource(client, backgroundProcessPath(org, args.server, args.background_process), signal));
      return {
        structured: { background_processes: [process], next_cursor: null, has_more: false },
        summary: `\`${process.command}\` is ${process.status}.`,
      };
    }
    const response = await client.get<CollectionDocument>(backgroundProcessesPath(org, args.server), {
      query: {
        filter: { site_id: args.site === undefined ? undefined : String(args.site), user: args.user, directory: args.directory },
        sort: args.sort,
        page: { size: args.page_size, cursor: args.cursor },
      },
      signal,
    });
    const page = flattenCollection(response.data);
    const processes = page.items.map(formatBackgroundProcess);
    const notRunning = processes.filter((process) => process.status !== 'running');
    return {
      structured: { background_processes: processes, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        processes.length === 0
          ? 'No background processes found.'
          : `Found ${processes.length} background process(es)${
              notRunning.length > 0 ? `; not running: ${notRunning.map((p) => `${p.id} (${p.status})`).join(', ')}` : ', all running'
            }.${paginationSummary(page.nextCursor)}`,
    };
  },
});
