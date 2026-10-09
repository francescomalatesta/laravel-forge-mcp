import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { apiPath } from '../../forge/path.js';
import { defineTool } from '../define-tool.js';
import { idInput, organizationInput, paginationInput, paginationOutput, paginationSummary, serverInput } from '../shared/schemas.js';
import { deploymentOutput, formatDeployment, sitePath } from './shared.js';

export const listDeployments = defineTool({
  name: 'forge_list_deployments',
  title: 'List deployments',
  description:
    'List recent deployments of a site, or of every site on a server when `site` is omitted, newest first by default. Shows status, commit and timing. Use forge_get_deployment for the log of one deployment.',
  toolset: 'deployments',
  operations: ['organizations.servers.sites.deployments.index', 'organizations.servers.deployments.index'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: 'Check the server and site IDs with forge_list_sites.',
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    site: idInput('Only list deployments of this site. Omit to list deployments of every site on the server.').optional(),
    commit_hash: z.string().min(1).optional().describe('Filter by commit hash.'),
    commit_message: z.string().min(1).optional().describe('Filter by commit message.'),
    commit_author: z.string().min(1).optional().describe('Filter by commit author.'),
    sort: z.enum(['-created_at', 'created_at']).default('-created_at').describe('Sort by creation date.'),
    ...paginationInput,
  },
  outputSchema: {
    deployments: z.array(deploymentOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const org = organization(args.organization);
    const onSite = args.site !== undefined;
    const path = onSite
      ? `${sitePath(org, args.server, args.site!)}/deployments`
      : apiPath`/orgs/${org}/servers/${args.server}/deployments`;

    const response = await client.get<CollectionDocument>(path, {
      query: {
        filter: { commit_hash: args.commit_hash, commit_message: args.commit_message, commit_author: args.commit_author },
        sort: [args.sort],
        include: onSite ? undefined : ['site', 'initiator'],
        page: { size: args.page_size, cursor: args.cursor },
      },
      signal,
    });
    const page = flattenCollection(response.data);
    const deployments = page.items.map(formatDeployment);
    const scope = onSite ? `site ${args.site}` : `server ${args.server}`;

    return {
      structured: { deployments, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        deployments.length === 0
          ? `No deployments found for ${scope}.`
          : `Found ${deployments.length} deployment(s) for ${scope}; the first is ${deployments[0]!.status}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
