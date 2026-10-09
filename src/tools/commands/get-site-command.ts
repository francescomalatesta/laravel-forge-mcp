import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { siteScopeInput } from '../shared/site-scope.js';
import { commandInput, commandOutput, commandsPath, fetchOutput, formatCommand, NO_OUTPUT, outputFields, outputLinesInput } from './shared.js';

export const getSiteCommand = defineTool({
  name: 'forge_get_site_command',
  title: 'Get site command',
  description: 'Get a command run on a site with its status, exit code and the end of its output.',
  toolset: 'commands',
  operations: ['organizations.servers.sites.commands.show', 'organizations.servers.sites.commands.output.show'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: 'Check the command ID with forge_list_site_commands.',
  inputSchema: {
    ...siteScopeInput,
    command: commandInput,
    include_output: z.boolean().default(true).describe('Also fetch the output.'),
    output_lines: outputLinesInput(100),
  },
  outputSchema: {
    command: commandOutput,
    ...outputFields,
  },
  async handler(args, { client, organization, signal }) {
    const path = `${commandsPath(organization(args.organization), args.server, args.site)}/${encodeURIComponent(String(args.command))}`;
    const [command, output] = await Promise.all([
      readResource(client, path, signal).then(formatCommand),
      args.include_output ? fetchOutput(client, path, args.output_lines, signal) : Promise.resolve(NO_OUTPUT),
    ]);
    return {
      structured: { command, ...output },
      summary: `\`${command.command}\` is ${command.status}${command.exit_code === null ? '' : ` (exit code ${command.exit_code})`}.${
        command.error_output ? ` Error: ${command.error_output}` : ''
      }`,
    };
  },
});
