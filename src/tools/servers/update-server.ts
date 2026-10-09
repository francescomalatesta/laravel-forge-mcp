import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { formatServer, serverOutput } from './format.js';
import { SERVER_NOT_FOUND_HINT, serverPath } from './shared.js';

export const updateServer = defineTool({
  name: 'forge_update_server',
  title: 'Update server',
  description:
    "Change a server's name, public or private IP address (when the provider changed it), timezone or tags in Forge. Only the given fields change.",
  toolset: 'servers',
  operations: ['organizations.servers.update'],
  permissions: ['server:manage-meta'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    name: z.string().min(1).optional(),
    ip_address: z.string().min(1).optional().describe('Public IP address Forge uses to connect.'),
    private_ip_address: z.string().min(1).optional(),
    timezone: z.string().min(1).optional().describe('IANA timezone, e.g. "Europe/Rome".'),
    tags: z.array(z.string().min(1)).optional().describe('Replaces the server tags.'),
  },
  outputSchema: {
    server: serverOutput,
  },
  async handler(args, { client, organization, signal }) {
    const { organization: _org, server: id, ...body } = args;
    if (Object.values(body).every((value) => value === undefined)) {
      throw new ToolInputError('Nothing to update: pass at least one field to change.');
    }
    const response = await client.put<SingleDocument>(serverPath(organization(args.organization), id), { body, signal });
    const server = formatServer(flattenSingle(response.data), true);
    const changed = Object.entries(body).filter(([, value]) => value !== undefined).map(([field]) => field);
    return { structured: { server }, summary: `Server ${server.id} updated: ${changed.join(', ')}.` };
  },
});
