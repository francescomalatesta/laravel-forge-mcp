import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from '../shared/site-scope.js';

export const healthcheckOutput = {
  healthcheck_endpoint: z.string().nullable().describe('URL Forge checks after zero-downtime deployments, or null.'),
};

export const getSiteHealthcheck = defineTool({
  name: 'forge_get_site_healthcheck',
  title: 'Get site healthcheck',
  description: 'Get the healthcheck URL Forge calls to verify the site after zero-downtime deployments.',
  toolset: 'sites',
  operations: ['organizations.servers.sites.healthcheck.show'],
  permissions: ['site:manage-project'],
  readOnly: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: siteScopeInput,
  outputSchema: healthcheckOutput,
  async handler(args, { client, organization, signal }) {
    const response = await client.get<SingleDocument>(
      `${sitePath(organization(args.organization), args.server, args.site)}/healthcheck`,
      { signal },
    );
    const endpoint = (flattenSingle(response.data).healthcheck_endpoint as string | null | undefined) ?? null;
    return {
      structured: { healthcheck_endpoint: endpoint },
      summary: endpoint ? `Healthcheck endpoint: ${endpoint}.` : 'No healthcheck endpoint is configured.',
    };
  },
});
