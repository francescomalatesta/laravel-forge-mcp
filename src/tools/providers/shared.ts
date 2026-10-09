import { z } from 'zod';
import type { ForgeClient } from '../../forge/client.js';
import { flattenCollection, type CollectionDocument, type FlatResource } from '../../forge/jsonapi.js';
import { apiPath } from '../../forge/path.js';
import { ToolInputError } from '../errors.js';
import { pick } from '../shared/schemas.js';

export const providerRefInput = z
  .union([z.number().int().nonnegative(), z.string().min(1)])
  .describe('Provider ID or slug, e.g. "ocean2" (DigitalOcean), "hetzner", "aws", "vultr", "akamai", "laravel". Use forge_list_providers to find it.');

export const regionRefInput = z
  .union([z.number().int().nonnegative(), z.string().min(1)])
  .describe('Region ID or code, e.g. "fra1". Use forge_list_provider_regions to find it.');

export function providerPath(provider: string | number): string {
  return apiPath`/providers/${provider}`;
}

const isId = (ref: string | number) => typeof ref === 'number' || /^\d+$/.test(ref);

async function firstPage(client: ForgeClient, path: string, signal: AbortSignal): Promise<FlatResource[]> {
  const response = await client.get<CollectionDocument>(path, { query: { page: { size: 100 } }, signal });
  return flattenCollection(response.data).items;
}

/** Provider ID from an ID or a slug (the API paths take the ID). */
export async function resolveProviderId(client: ForgeClient, ref: string | number, signal: AbortSignal): Promise<string> {
  if (isId(ref)) return String(ref);
  const slug = String(ref).trim().toLowerCase();
  const match = (await firstPage(client, '/providers', signal)).find((provider) => provider.slug === slug);
  if (!match) throw new ToolInputError(`Unknown provider "${ref}". Check the slugs with forge_list_providers.`);
  return match.id;
}

/** Region ID from an ID or a region code. */
export async function resolveRegionId(client: ForgeClient, providerId: string, ref: string | number, signal: AbortSignal): Promise<string> {
  if (isId(ref)) return String(ref);
  const code = String(ref).trim().toLowerCase();
  const match = (await firstPage(client, `${providerPath(providerId)}/regions`, signal)).find(
    (region) => String(region.code).toLowerCase() === code || String(region.alternate_code ?? '').toLowerCase() === code,
  );
  if (!match) throw new ToolInputError(`Unknown region "${ref}" for provider ${providerId}. Check the codes with forge_list_provider_regions.`);
  return match.id;
}

export const providerOutput = z.looseObject({
  id: z.string(),
  name: z.string().nullable(),
  slug: z.string().nullable().describe('Use it as the `provider` of forge_create_server.'),
  currency: z.string().nullable(),
  default_region_code: z.string().nullable(),
  default_size_code: z.string().nullable(),
});

export function formatProvider(flat: Record<string, unknown>) {
  return pick(flat, ['id', 'name', 'slug', 'currency', 'default_region_code', 'default_size_code']) as z.output<typeof providerOutput>;
}

export const regionOutput = z.looseObject({
  id: z.string(),
  name: z.string().nullable(),
  code: z.string().nullable().describe('Use it as the `region` of forge_create_server.'),
  alternate_code: z.string().nullable(),
});

export function formatRegion(flat: Record<string, unknown>) {
  return pick(flat, ['id', 'name', 'code', 'alternate_code']) as z.output<typeof regionOutput>;
}

export const sizeOutput = z.looseObject({
  id: z.string(),
  name: z.string().nullable(),
  code: z.string().nullable().describe('Use it as the `size` of forge_create_server.'),
  cpus: z.number().nullable(),
  ram: z.number().nullable().describe('MB.'),
  disk: z.number().nullable().describe('GB.'),
  disk_type: z.string().nullable(),
  architecture: z.string().nullable(),
  category: z.string().nullable(),
});

export function formatSize(flat: Record<string, unknown>) {
  return pick(flat, ['id', 'name', 'code', 'cpus', 'ram', 'disk', 'disk_type', 'architecture', 'category']) as z.output<typeof sizeOutput>;
}
