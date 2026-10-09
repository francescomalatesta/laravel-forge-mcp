import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, waitFor, waitInput } from '../shared/async.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput } from '../shared/site-scope.js';
import { fetchOutput, NO_OUTPUT, outputFields, outputLinesInput } from '../shared/output.js';
import { commandOutput, commandPhase, commandsPath, formatCommand } from './shared.js';

const CHECK_WITH = 'forge_get_site_command';

export const runSiteCommand = defineTool({
  name: 'forge_run_site_command',
  title: 'Run site command',
  description:
    'Run a shell command in the site directory as the site user (e.g. `php artisan migrate --force`, `php artisan cache:clear`). It runs with the same privileges as the application: confirm commands that change data with the user. Waits for the result and returns the end of the output unless `wait` is false.',
  toolset: 'commands',
  operations: [
    'organizations.servers.sites.commands.store',
    'organizations.servers.sites.commands.index',
    'organizations.servers.sites.commands.output.show',
  ],
  permissions: ['site:manage-commands', 'server:view'],
  readOnly: false,
  destructive: true,
  idempotent: false,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    command: z.string().min(1).describe('Command to run, e.g. "php artisan migrate --force".'),
    output_lines: outputLinesInput(100),
    ...waitInput(120),
  },
  outputSchema: {
    ...operationOutput,
    command: commandOutput.nullable().describe('The command run once it shows up.'),
    ...outputFields,
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const base = commandsPath(organization(args.organization), args.server, args.site);
    const runs = async () => {
      const response = await client.get<CollectionDocument>(base, {
        query: { filter: { command: args.command }, sort: ['-created_at'], page: { size: 100 } },
        signal,
      });
      return flattenCollection(response.data).items;
    };
    // Forge returns no body: remember earlier runs of the same command to spot the new one.
    const earlier = args.wait ? new Set((await runs()).map((run) => run.id)) : undefined;
    await client.post(base, { body: { command: args.command }, signal });
    const action = `run \`${args.command}\``;
    if (!earlier) {
      return {
        structured: { status: 'queued' as const, check_with: 'forge_list_site_commands', command: null, ...NO_OUTPUT },
        summary: `Forge queued ${action}. Find it with forge_list_site_commands, then read its output with ${CHECK_WITH}.`,
      };
    }

    const result = await waitFor({
      poll: async () => (await runs()).find((run) => !earlier.has(run.id)) ?? null,
      phase: (run) => (run ? commandPhase(run) : 'pending'),
      describe: (run) => (run ? `Command is ${run.status}` : 'Waiting for the command to start'),
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const command = result.value ? formatCommand(result.value) : null;
    const finished = command && (result.status === 'completed' || result.status === 'failed');
    const output = finished ? await fetchOutput(client, `${base}/${encodeURIComponent(command.id)}`, args.output_lines, signal) : NO_OUTPUT;
    const done = outcome(result, {
      action,
      checkWith: CHECK_WITH,
      timeoutSeconds: args.timeout_seconds,
      detail: command
        ? `Command ID: ${command.id}${command.exit_code === null ? '' : `, exit code ${command.exit_code}`}.${command.error_output ? ` Error: ${command.error_output}` : ''}`
        : undefined,
    });
    return { structured: { ...done.structured, command, ...output }, summary: done.summary };
  },
});
