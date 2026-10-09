import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { siteScopeInput } from '../shared/site-scope.js';
import { commandInput, commandsPath } from './shared.js';

export const deleteSiteCommand = defineTool({
  name: 'forge_delete_site_command',
  title: 'Delete site command',
  description: 'Delete a command run and its output from the site history.',
  toolset: 'commands',
  operations: ['organizations.servers.sites.commands.destroy'],
  permissions: ['site:manage-commands'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  notFoundHint: 'Check the command ID with forge_list_site_commands.',
  inputSchema: {
    ...siteScopeInput,
    command: commandInput,
  },
  outputSchema: {
    deleted: z.boolean(),
  },
  async handler(args, { client, organization, signal }) {
    await client.delete(`${commandsPath(organization(args.organization), args.server, args.site)}/${encodeURIComponent(String(args.command))}`, {
      signal,
    });
    return { structured: { deleted: true }, summary: `Deleted command ${args.command} from the history.` };
  },
});
