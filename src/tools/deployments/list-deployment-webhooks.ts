import { z } from 'zod';
import { flattenCollection, flattenSingle, type CollectionDocument, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { idInput, paginationInput, paginationOutput, paginationSummary, pick } from '../shared/schemas.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from './shared.js';

const WEBHOOK_FIELDS = ['id', 'url', 'created_at', 'updated_at'] as const;

const webhookOutput = z.looseObject({
  id: z.string(),
  url: z.string().nullable().describe('URL notified after every deployment.'),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export const listDeploymentWebhooks = defineTool({
  name: 'forge_list_deployment_webhooks',
  title: 'List deployment webhooks',
  description:
    'List the URLs Forge notifies after each deployment of a site, or get one webhook by ID with `webhook`.',
  toolset: 'deployments',
  operations: ['organizations.servers.sites.webhooks.index', 'organizations.servers.sites.webhooks.show'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    webhook: idInput('Return only this webhook.').optional(),
    ...paginationInput,
  },
  outputSchema: {
    webhooks: z.array(webhookOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const base = `${sitePath(organization(args.organization), args.server, args.site)}/webhooks`;
    if (args.webhook !== undefined) {
      const response = await client.get<SingleDocument>(`${base}/${encodeURIComponent(String(args.webhook))}`, { signal });
      const webhook = pick(flattenSingle(response.data), WEBHOOK_FIELDS) as z.output<typeof webhookOutput>;
      return { structured: { webhooks: [webhook], next_cursor: null, has_more: false }, summary: `Webhook ${webhook.id}: ${webhook.url}.` };
    }

    const response = await client.get<CollectionDocument>(base, {
      query: { page: { size: args.page_size, cursor: args.cursor } },
      signal,
    });
    const page = flattenCollection(response.data);
    const webhooks = page.items.map((item) => pick(item, WEBHOOK_FIELDS) as z.output<typeof webhookOutput>);
    return {
      structured: { webhooks, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        webhooks.length === 0
          ? 'The site has no deployment webhooks.'
          : `Found ${webhooks.length} deployment webhook(s).${paginationSummary(page.nextCursor)}`,
    };
  },
});
