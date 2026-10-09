import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { operationOutput, queued } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT, serverPath } from './shared.js';

export const runServerAction = defineTool({
  name: 'forge_run_server_action',
  title: 'Reboot or power-cycle a server',
  description:
    'Reboot the server ("reboot", a clean OS restart) or power-cycle it ("power-cycle", a hard restart through the provider, for unresponsive servers). Every site on the server is unavailable meanwhile.',
  toolset: 'servers',
  operations: ['organizations.servers.actions.store'],
  permissions: ['server:manage-services'],
  readOnly: false,
  destructive: true,
  idempotent: false,
  async: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    action: z.enum(['reboot', 'power-cycle']),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal }) {
    await client.post(`${serverPath(organization(args.organization), args.server)}/actions`, { body: { action: args.action }, signal });
    // The server resource exposes no reliable reboot state to wait for.
    return queued(`${args.action} server ${args.server}`, 'forge_list_server_events', `(server ${args.server})`);
  },
});
