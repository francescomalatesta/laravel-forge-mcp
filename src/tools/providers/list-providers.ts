import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { paginationInput, paginationOutput, paginationSummary } from '../shared/schemas.js';
import { formatProvider, providerOutput, providerPath, providerRefInput, resolveProviderId } from './shared.js';

export const listProviders = defineTool({
  name: 'forge_list_providers',
  title: 'List providers',
  description:
    'List the cloud providers Forge can create servers on (DigitalOcean, Hetzner, AWS, Vultr, Akamai, Laravel…) with their default region and size, or get one with `provider`. Next: forge_list_provider_regions and forge_list_provider_sizes.',
  toolset: 'providers',
  operations: ['providers.index', 'providers.show'],
  permissions: [],
  readOnly: true,
  inputSchema: {
    provider: providerRefInput.optional().describe('Return only this provider (ID or slug).'),
    ...paginationInput,
  },
  outputSchema: {
    providers: z.array(providerOutput),
    ...paginationOutput,
  },
  async handler(args, { client, signal }) {
    if (args.provider !== undefined) {
      const id = await resolveProviderId(client, args.provider, signal);
      const provider = formatProvider(await readResource(client, providerPath(id), signal));
      return { structured: { providers: [provider], next_cursor: null, has_more: false }, summary: `${provider.name} (${provider.slug}, ID ${provider.id}).` };
    }
    const response = await client.get<CollectionDocument>('/providers', { query: { page: { size: args.page_size, cursor: args.cursor } }, signal });
    const page = flattenCollection(response.data);
    const providers = page.items.map(formatProvider);
    return {
      structured: { providers, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary: `Found ${providers.length} provider(s): ${providers.map((p) => `${p.name} (${p.slug})`).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
