import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { queued, queuedOutput } from '../shared/async.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from './shared.js';

export const createDeploymentWebhook = defineTool({
  name: 'forge_create_deployment_webhook',
  title: 'Create deployment webhook',
  description: 'Add a URL that Forge notifies (HTTP POST) after every deployment of the site.',
  toolset: 'deployments',
  operations: ['organizations.servers.sites.webhooks.store'],
  permissions: ['site:manage-notifications'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    url: z.string().url().describe('URL to notify after each deployment.'),
  },
  outputSchema: queuedOutput,
  async handler(args, { client, organization, signal }) {
    await client.post(`${sitePath(organization(args.organization), args.server, args.site)}/webhooks`, {
      body: { url: args.url },
      signal,
    });
    return queued('add the deployment webhook', 'forge_list_deployment_webhooks');
  },
});
