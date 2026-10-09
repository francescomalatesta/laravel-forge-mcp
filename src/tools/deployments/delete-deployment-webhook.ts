import { defineTool } from '../define-tool.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { idInput } from '../shared/schemas.js';
import { siteScopeInput, sitePath } from './shared.js';

const CHECK_WITH = 'forge_list_deployment_webhooks';

export const deleteDeploymentWebhook = defineTool({
  name: 'forge_delete_deployment_webhook',
  title: 'Delete deployment webhook',
  description: 'Remove a deployment webhook from a site: its URL will no longer be notified after deployments.',
  toolset: 'deployments',
  operations: ['organizations.servers.sites.webhooks.destroy', 'organizations.servers.sites.webhooks.show'],
  permissions: ['site:manage-notifications', 'server:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: 'Check the webhook ID with forge_list_deployment_webhooks.',
  inputSchema: {
    ...siteScopeInput,
    webhook: idInput('Webhook ID. Use forge_list_deployment_webhooks to find it.'),
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = `${sitePath(organization(args.organization), args.server, args.site)}/webhooks/${encodeURIComponent(String(args.webhook))}`;
    await client.delete(path, { signal });
    if (!args.wait) return queued('delete the deployment webhook', CHECK_WITH);

    const result = await waitFor({
      poll: () => orGone(() => client.get(path, { signal })),
      phase: (webhook) => (webhook === null ? 'completed' : 'pending'),
      describe: () => 'Waiting for the webhook to be removed',
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action: 'delete the deployment webhook', checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
