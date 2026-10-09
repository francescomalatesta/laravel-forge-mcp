import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { paginationInput, paginationOutput, paginationSummary } from '../shared/schemas.js';
import { formatSize, providerPath, providerRefInput, regionRefInput, resolveProviderId, resolveRegionId, sizeOutput } from './shared.js';

export const listProviderSizes = defineTool({
  name: 'forge_list_provider_sizes',
  title: 'List provider sizes',
  description:
    'List the server sizes of a cloud provider (CPUs, RAM, disk), optionally only those available in a `region`, or get one with `size`. Use the code as `size` in forge_create_server.',
  toolset: 'providers',
  operations: [
    'providers.sizes.index',
    'providers.sizes.show',
    'providers.regions.sizes.index',
    'providers.regions.sizes.show',
    'providers.index',
    'providers.regions.index',
  ],
  permissions: [],
  readOnly: true,
  notFoundHint: 'Check the provider with forge_list_providers and the region with forge_list_provider_regions.',
  inputSchema: {
    provider: providerRefInput,
    region: regionRefInput.optional().describe('Only sizes available in this region (ID or code).'),
    size: z.string().min(1).optional().describe('Return only this size (its ID).'),
    ...paginationInput,
  },
  outputSchema: {
    sizes: z.array(sizeOutput),
    ...paginationOutput,
  },
  async handler(args, { client, signal }) {
    const providerId = await resolveProviderId(client, args.provider, signal);
    const scope =
      args.region === undefined ? providerPath(providerId) : `${providerPath(providerId)}/regions/${encodeURIComponent(await resolveRegionId(client, providerId, args.region, signal))}`;
    const base = `${scope}/sizes`;
    if (args.size !== undefined) {
      const size = formatSize(await readResource(client, `${base}/${encodeURIComponent(args.size)}`, signal));
      return { structured: { sizes: [size], next_cursor: null, has_more: false }, summary: `Size ${size.name}.` };
    }
    const response = await client.get<CollectionDocument>(base, { query: { page: { size: args.page_size, cursor: args.cursor } }, signal });
    const page = flattenCollection(response.data);
    const sizes = page.items.map(formatSize);
    return {
      structured: { sizes, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary: `Found ${sizes.length} size(s)${args.region === undefined ? '' : ` in region ${args.region}`}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
