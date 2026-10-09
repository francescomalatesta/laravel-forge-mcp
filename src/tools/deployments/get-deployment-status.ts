import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from './shared.js';

export const getDeploymentStatus = defineTool({
  name: 'forge_get_deployment_status',
  title: 'Get deployment status',
  description:
    'Check whether a deployment is currently running on a site. A null status means no deployment is in progress. If a deployment looks stuck, forge_reset_deployment_state clears it.',
  toolset: 'deployments',
  operations: ['organizations.servers.sites.deployments.status.show'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: siteScopeInput,
  outputSchema: {
    status: z.string().nullable().describe('Current deployment status, or null when nothing is running.'),
    started_at: z.string().nullable(),
  },
  async handler(args, { client, organization, signal }) {
    const response = await client.get<SingleDocument>(
      `${sitePath(organization(args.organization), args.server, args.site)}/deployments/status`,
      { signal },
    );
    const flat = flattenSingle(response.data);
    const status = (flat.status as string | null | undefined) ?? null;
    const startedAt = (flat.started_at as string | null | undefined) ?? null;

    return {
      structured: { status, started_at: startedAt },
      summary: status
        ? `A deployment is ${status}${startedAt ? ` since ${startedAt}` : ''}.`
        : 'No deployment is currently running on this site.',
    };
  },
});
