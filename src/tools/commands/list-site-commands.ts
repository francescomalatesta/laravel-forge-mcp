import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { paginationInput, paginationOutput, paginationSummary } from '../shared/schemas.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput } from '../shared/site-scope.js';
import { COMMAND_STATUSES, commandOutput, commandsPath, formatCommand } from './shared.js';

const SORT = ['status', '-status', 'created_at', '-created_at', 'updated_at', '-updated_at'] as const;

export const listSiteCommands = defineTool({
  name: 'forge_list_site_commands',
  title: 'List site commands',
  description: 'List the commands run on a site (newest first by default) with status and exit code. Read the output of one with forge_get_site_command.',
  toolset: 'commands',
  operations: ['organizations.servers.sites.commands.index'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    status: z.enum(COMMAND_STATUSES).optional().describe('Filter by status.'),
    command: z.string().min(1).optional().describe('Filter by command text.'),
    user_id: z.union([z.number().int(), z.string().min(1)]).optional().describe('Filter by the user who ran it.'),
    sort: z.array(z.enum(SORT)).min(1).optional().describe('Defaults to newest first.'),
    ...paginationInput,
  },
  outputSchema: {
    commands: z.array(commandOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const response = await client.get<CollectionDocument>(commandsPath(organization(args.organization), args.server, args.site), {
      query: {
        filter: { status: args.status, command: args.command, user_id: args.user_id === undefined ? undefined : String(args.user_id) },
        sort: args.sort ?? ['-created_at'],
        page: { size: args.page_size, cursor: args.cursor },
      },
      signal,
    });
    const page = flattenCollection(response.data);
    const commands = page.items.map(formatCommand);
    return {
      structured: { commands, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        commands.length === 0
          ? 'No commands found.'
          : `Found ${commands.length} command(s); latest: \`${commands[0]!.command}\` (${commands[0]!.status}).${paginationSummary(page.nextCursor)}`,
    };
  },
});
