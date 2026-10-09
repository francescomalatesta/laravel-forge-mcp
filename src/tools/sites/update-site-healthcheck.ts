import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from '../shared/site-scope.js';
import { healthcheckOutput } from './get-site-healthcheck.js';

export const updateSiteHealthcheck = defineTool({
  name: 'forge_update_site_healthcheck',
  title: 'Update site healthcheck',
  description: 'Set or remove (null) the healthcheck URL Forge calls to verify the site after zero-downtime deployments.',
  toolset: 'sites',
  operations: ['organizations.servers.sites.healthcheck.update'],
  permissions: ['site:manage-project'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    healthcheck_endpoint: z.string().url().nullable().describe('Healthcheck URL, or null to remove it.'),
  },
  outputSchema: healthcheckOutput,
  async handler(args, { client, organization, signal }) {
    await client.put(`${sitePath(organization(args.organization), args.server, args.site)}/healthcheck`, {
      body: { healthcheck_endpoint: args.healthcheck_endpoint },
      signal,
    });
    return {
      structured: { healthcheck_endpoint: args.healthcheck_endpoint },
      summary: args.healthcheck_endpoint ? `Healthcheck set to ${args.healthcheck_endpoint}.` : 'Healthcheck removed.',
    };
  },
});
