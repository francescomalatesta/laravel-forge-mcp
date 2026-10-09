import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { organizationInput, paginationInput, paginationOutput, paginationSummary } from '../shared/schemas.js';
import {
  formatStorageProvider,
  STORAGE_PROVIDER_NOT_FOUND_HINT,
  STORAGE_PROVIDERS,
  storageProviderInput,
  storageProviderOutput,
  storageProviderPath,
  storageProvidersPath,
} from './shared.js';

const SORT = ['name', '-name', 'provider', '-provider', 'created_at', '-created_at', 'updated_at', '-updated_at'] as const;

export const listStorageProviders = defineTool({
  name: 'forge_list_storage_providers',
  title: 'List storage providers',
  description:
    'List the storage providers (S3, DigitalOcean Spaces, Hetzner, OVH, Scaleway, S3-compatible) where the organization stores database backups, or get one with `storage_provider`. Credentials are never returned.',
  toolset: 'storage',
  operations: ['organizations.storage-providers.index', 'organizations.storage-providers.show'],
  permissions: ['storage:manage'],
  readOnly: true,
  notFoundHint: STORAGE_PROVIDER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    storage_provider: storageProviderInput.optional().describe('Return only this storage provider.'),
    provider: z.enum(STORAGE_PROVIDERS).optional().describe('Filter by provider type.'),
    sort: z.array(z.enum(SORT)).min(1).optional(),
    ...paginationInput,
  },
  outputSchema: {
    storage_providers: z.array(storageProviderOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const org = organization(args.organization);
    if (args.storage_provider !== undefined) {
      const provider = formatStorageProvider(await readResource(client, storageProviderPath(org, args.storage_provider), signal));
      return {
        structured: { storage_providers: [provider], next_cursor: null, has_more: false },
        summary: `Storage provider ${provider.name} (${provider.provider_name}) is ${provider.in_use ? '' : 'not '}used by backups.`,
      };
    }
    const response = await client.get<CollectionDocument>(storageProvidersPath(org), {
      query: { filter: { provider: args.provider }, sort: args.sort, page: { size: args.page_size, cursor: args.cursor } },
      signal,
    });
    const page = flattenCollection(response.data);
    const providers = page.items.map(formatStorageProvider);
    return {
      structured: { storage_providers: providers, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        providers.length === 0
          ? 'No storage providers found. Add one with forge_create_storage_provider.'
          : `Found ${providers.length} storage provider(s): ${providers.map((p) => `${p.name} (${p.id}, ${p.provider})`).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
