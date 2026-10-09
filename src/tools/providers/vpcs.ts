import { z } from 'zod';
import { apiPath } from '../../forge/path.js';
import { idInput, pick } from '../shared/schemas.js';

export const credentialInput = idInput('Server credential ID (the provider account). Use forge_list_server_credentials to find it.');
export const vpcRegionInput = z.string().min(1).describe('Region code, e.g. "fra1". Use forge_list_provider_regions to find it.');

export function vpcsPath(org: string, credential: string | number, region: string): string {
  return apiPath`/orgs/${org}/server-credentials/${credential}/regions/${region}/vpcs`;
}

export const vpcOutput = z.looseObject({
  id: z.string().describe('Use it as `vpc` of forge_create_server.'),
  name: z.string().nullable(),
  cidrBlock: z.string().nullable(),
  region: z.string().nullable(),
  subnets: z.array(z.looseObject({ id: z.string(), name: z.string(), cidrBlock: z.string() })).nullable().describe('AWS: use a subnet ID as `subnet`.'),
});

export function formatVpc(flat: Record<string, unknown>) {
  return pick(flat, ['id', 'name', 'cidrBlock', 'region', 'subnets']) as z.output<typeof vpcOutput>;
}
