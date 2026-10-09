import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { organizationInput } from '../shared/schemas.js';
import { credentialInput, formatVpc, vpcOutput, vpcRegionInput, vpcsPath } from './vpcs.js';

export const listVpcs = defineTool({
  name: 'forge_list_vpcs',
  title: 'List VPCs',
  description: 'List the private networks (VPCs) of a provider account in a region, or get one with `vpc`. Servers created in the same VPC talk over private IPs.',
  toolset: 'providers',
  operations: ['organizations.server-credentials.vpcs.index', 'organizations.server-credentials.vpcs.show'],
  permissions: ['credential:view', 'server:view'],
  readOnly: true,
  notFoundHint: 'Check the credential with forge_list_server_credentials and the region code with forge_list_provider_regions.',
  inputSchema: {
    organization: organizationInput,
    credential: credentialInput,
    region: vpcRegionInput,
    vpc: z.string().min(1).optional().describe('Return only this VPC (its ID).'),
  },
  outputSchema: {
    vpcs: z.array(vpcOutput),
  },
  async handler(args, { client, organization, signal }) {
    const base = vpcsPath(organization(args.organization), args.credential, args.region);
    if (args.vpc !== undefined) {
      const vpc = formatVpc(await readResource(client, `${base}/${encodeURIComponent(args.vpc)}`, signal));
      return { structured: { vpcs: [vpc] }, summary: `VPC ${vpc.name} (${vpc.cidrBlock}).` };
    }
    // The endpoint is not paginated: it returns every VPC of the region.
    const response = await client.get<CollectionDocument>(base, { signal });
    const page = flattenCollection(response.data);
    const vpcs = page.items.map(formatVpc);
    return {
      structured: { vpcs },
      summary:
        vpcs.length === 0
          ? `No VPCs in ${args.region}. Create one with forge_create_vpc.`
          : `Found ${vpcs.length} VPC(s): ${vpcs.map((v) => `${v.name} (${v.id})`).join(', ')}.`,
    };
  },
});
