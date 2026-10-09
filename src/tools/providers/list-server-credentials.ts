import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { apiPath } from '../../forge/path.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { idInput, organizationInput, paginationInput, paginationOutput, paginationSummary, pick } from '../shared/schemas.js';

export const serverCredentialOutput = z.looseObject({
  id: z.string().describe('Use it as `credential` of forge_create_server.'),
  name: z.string().nullable(),
  provider: z.string().nullable(),
  in_use: z.boolean().nullable().describe('Used by servers.'),
  created_at: z.string().nullable(),
});

export function formatServerCredential(flat: Record<string, unknown>) {
  return pick(flat, ['id', 'name', 'provider', 'in_use', 'created_at']) as z.output<typeof serverCredentialOutput>;
}

export const listServerCredentials = defineTool({
  name: 'forge_list_server_credentials',
  title: 'List server credentials',
  description:
    "List the cloud provider accounts (API credentials) connected to the organization, or get one with `credential`. Forge creates servers with them; their secrets are never returned.",
  toolset: 'providers',
  operations: ['organizations.server-credentials.index', 'organizations.server-credentials.show'],
  permissions: ['credential:view'],
  readOnly: true,
  inputSchema: {
    organization: organizationInput,
    credential: idInput('Server credential ID.').optional().describe('Return only this credential.'),
    ...paginationInput,
  },
  outputSchema: {
    credentials: z.array(serverCredentialOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const base = apiPath`/orgs/${organization(args.organization)}/server-credentials`;
    if (args.credential !== undefined) {
      const credential = formatServerCredential(await readResource(client, `${base}/${encodeURIComponent(String(args.credential))}`, signal));
      return { structured: { credentials: [credential], next_cursor: null, has_more: false }, summary: `${credential.name} (${credential.provider}).` };
    }
    const response = await client.get<CollectionDocument>(base, { query: { page: { size: args.page_size, cursor: args.cursor } }, signal });
    const page = flattenCollection(response.data);
    const credentials = page.items.map(formatServerCredential);
    return {
      structured: { credentials, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        credentials.length === 0
          ? 'No provider credentials are connected: add one in the Forge dashboard, or create servers with provider "custom".'
          : `Found ${credentials.length} credential(s): ${credentials.map((c) => `${c.name} (${c.provider}, ID ${c.id})`).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
