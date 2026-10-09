import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { paginationInput, paginationOutput, paginationSummary } from '../shared/schemas.js';
import { formatRegion, providerPath, providerRefInput, regionOutput, regionRefInput, resolveProviderId, resolveRegionId } from './shared.js';

export const listProviderRegions = defineTool({
  name: 'forge_list_provider_regions',
  title: 'List provider regions',
  description: 'List the regions of a cloud provider (code and name), or get one with `region`. Use the code as `region` in forge_create_server.',
  toolset: 'providers',
  operations: ['providers.regions.index', 'providers.regions.show', 'providers.index'],
  permissions: [],
  readOnly: true,
  notFoundHint: 'Check the provider with forge_list_providers.',
  inputSchema: {
    provider: providerRefInput,
    region: regionRefInput.optional().describe('Return only this region (ID or code).'),
    ...paginationInput,
  },
  outputSchema: {
    regions: z.array(regionOutput),
    ...paginationOutput,
  },
  async handler(args, { client, signal }) {
    const providerId = await resolveProviderId(client, args.provider, signal);
    const base = `${providerPath(providerId)}/regions`;
    if (args.region !== undefined) {
      const regionId = await resolveRegionId(client, providerId, args.region, signal);
      const region = formatRegion(await readResource(client, `${base}/${encodeURIComponent(regionId)}`, signal));
      return { structured: { regions: [region], next_cursor: null, has_more: false }, summary: `${region.name} (${region.code}, ID ${region.id}).` };
    }
    const response = await client.get<CollectionDocument>(base, { query: { page: { size: args.page_size, cursor: args.cursor } }, signal });
    const page = flattenCollection(response.data);
    const regions = page.items.map(formatRegion);
    return {
      structured: { regions, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary: `Found ${regions.length} region(s): ${regions.map((r) => `${r.code} (${r.name})`).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
