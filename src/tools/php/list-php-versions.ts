import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { organizationInput, paginationInput, paginationOutput, paginationSummary, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { formatPhpVersion, phpVersionOutput, phpVersionsPath } from './shared.js';

const SORT = ['version', '-version', 'status', '-status', 'created_at', '-created_at', 'updated_at', '-updated_at'] as const;

export const listPhpVersions = defineTool({
  name: 'forge_list_php_versions',
  title: 'List PHP versions',
  description: 'List the PHP versions installed on a server with their IDs and status. Default CLI and site versions are in forge_get_php_settings.',
  toolset: 'servers',
  operations: ['organizations.servers.php.versions.index'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    version: z.string().min(1).optional().describe('Filter by version, e.g. "8.3".'),
    status: z.string().min(1).optional().describe('Filter by status, e.g. "installed".'),
    sort: z.array(z.enum(SORT)).min(1).optional(),
    ...paginationInput,
  },
  outputSchema: {
    php_versions: z.array(phpVersionOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const response = await client.get<CollectionDocument>(phpVersionsPath(organization(args.organization), args.server), {
      query: {
        filter: { version: args.version, status: args.status },
        sort: args.sort,
        page: { size: args.page_size, cursor: args.cursor },
      },
      signal,
    });
    const page = flattenCollection(response.data);
    const versions = page.items.map(formatPhpVersion);
    return {
      structured: { php_versions: versions, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        versions.length === 0
          ? 'No PHP versions found.'
          : `Installed: ${versions.map((v) => `${v.version} (${v.status}, ID ${v.id})`).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
