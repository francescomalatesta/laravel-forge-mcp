import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from './shared.js';

const CHECK_WITH = 'forge_list_deployment_webhooks';

export const createDeploymentWebhook = defineTool({
  name: 'forge_create_deployment_webhook',
  title: 'Create deployment webhook',
  description: 'Add a URL that Forge notifies (HTTP POST) after every deployment of the site.',
  toolset: 'deployments',
  operations: ['organizations.servers.sites.webhooks.store', 'organizations.servers.sites.webhooks.index'],
  permissions: ['site:manage-notifications', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    url: z.string().url().describe('URL to notify after each deployment.'),
    ...waitInput(60),
  },
  outputSchema: {
    ...operationOutput,
    webhook_id: z.string().nullable().describe('ID of the new webhook once it exists.'),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const base = `${sitePath(organization(args.organization), args.server, args.site)}/webhooks`;
    await client.post(base, { body: { url: args.url }, signal });
    if (!args.wait) {
      const accepted = queued('add the deployment webhook', CHECK_WITH);
      return { ...accepted, structured: { ...accepted.structured, webhook_id: null } };
    }

    // Forge returns no body: the webhook is ready once it shows up in the list.
    const result = await waitFor({
      poll: async () => {
        const response = await client.get<CollectionDocument>(base, {
          query: { sort: ['-created_at'], page: { size: 100 } },
          signal,
        });
        return flattenCollection(response.data).items.find((item) => item.url === args.url) ?? null;
      },
      phase: (webhook) => (webhook ? 'completed' : 'pending'),
      describe: () => 'Waiting for the webhook to be created',
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const done = outcome(result, { action: 'add the deployment webhook', checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
    return { ...done, structured: { ...done.structured, webhook_id: result.value ? String(result.value.id) : null } };
  },
});
