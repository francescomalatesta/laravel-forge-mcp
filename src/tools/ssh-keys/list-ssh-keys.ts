import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { organizationInput, paginationInput, paginationOutput, paginationSummary, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { formatSshKey, sshKeyInput, sshKeyOutput, sshKeysPath } from './shared.js';

export const listSshKeys = defineTool({
  name: 'forge_list_ssh_keys',
  title: 'List SSH keys',
  description: 'List the SSH keys authorized to log in to a server (name, user, status), or get one with `key`. Key contents are not returned.',
  toolset: 'security',
  operations: ['organizations.servers.ssh-keys.index', 'organizations.servers.ssh-keys.show'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    key: sshKeyInput.optional().describe('Return only this key.'),
    name: z.string().min(1).optional().describe('Filter by name.'),
    user: z.string().min(1).optional().describe('Filter by server user.'),
    ...paginationInput,
  },
  outputSchema: {
    keys: z.array(sshKeyOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const base = sshKeysPath(organization(args.organization), args.server);
    if (args.key !== undefined) {
      const key = formatSshKey(await readResource(client, `${base}/${encodeURIComponent(String(args.key))}`, signal));
      return { structured: { keys: [key], next_cursor: null, has_more: false }, summary: `SSH key ${key.name} (${key.user}) is ${key.status}.` };
    }
    const response = await client.get<CollectionDocument>(base, {
      query: { filter: { name: args.name, user: args.user }, page: { size: args.page_size, cursor: args.cursor } },
      signal,
    });
    const page = flattenCollection(response.data);
    const keys = page.items.map(formatSshKey);
    return {
      structured: { keys, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        keys.length === 0
          ? 'No SSH keys found.'
          : `Found ${keys.length} SSH key(s): ${keys.map((k) => `${k.name} → ${k.user} (${k.id})`).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
