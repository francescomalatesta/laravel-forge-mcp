import { defineTool } from '../define-tool.js';
import { queued, queuedOutput } from '../shared/async.js';
import { idInput } from '../shared/schemas.js';
import { siteScopeInput, sitePath } from './shared.js';

export const deleteDeploymentWebhook = defineTool({
  name: 'forge_delete_deployment_webhook',
  title: 'Delete deployment webhook',
  description: 'Remove a deployment webhook from a site: its URL will no longer be notified after deployments.',
  toolset: 'deployments',
  operations: ['organizations.servers.sites.webhooks.destroy'],
  permissions: ['site:manage-notifications'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  notFoundHint: 'Check the webhook ID with forge_list_deployment_webhooks.',
  inputSchema: {
    ...siteScopeInput,
    webhook: idInput('Webhook ID. Use forge_list_deployment_webhooks to find it.'),
  },
  outputSchema: queuedOutput,
  async handler(args, { client, organization, signal }) {
    const base = sitePath(organization(args.organization), args.server, args.site);
    await client.delete(`${base}/webhooks/${encodeURIComponent(String(args.webhook))}`, { signal });
    return queued('delete the deployment webhook', 'forge_list_deployment_webhooks');
  },
});
