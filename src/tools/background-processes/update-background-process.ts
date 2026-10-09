import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { operationOutput, queued } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { BACKGROUND_PROCESS_NOT_FOUND_HINT, backgroundProcessInput, backgroundProcessPath } from './shared.js';

export const updateBackgroundProcess = defineTool({
  name: 'forge_update_background_process',
  title: 'Update background process',
  description:
    'Rename a background process and/or replace its Supervisor configuration (the [program:…] section: command, numprocs, user, stopwaitsecs, …). Supervisor reloads it.',
  toolset: 'jobs',
  operations: ['organizations.servers.background-processes.update'],
  permissions: ['server:create-daemons'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: BACKGROUND_PROCESS_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    background_process: backgroundProcessInput,
    name: z.string().min(1).describe('Name of the background process (required by Forge: pass the current one to keep it).'),
    config: z.string().min(1).optional().describe('Complete Supervisor configuration replacing the current one.'),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal }) {
    await client.put(backgroundProcessPath(organization(args.organization), args.server, args.background_process), {
      body: { name: args.name, config: args.config },
      signal,
    });
    // Neither the name nor the configuration is exposed by the API: nothing to compare.
    return queued(
      `update background process ${args.background_process}`,
      'forge_list_background_processes',
      '(its status shows whether it is running again)',
    );
  },
});
