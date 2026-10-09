import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { organizationInput } from '../shared/schemas.js';
import { credentialInput, formatVpc, vpcOutput, vpcRegionInput, vpcsPath } from './vpcs.js';

export const createVpc = defineTool({
  name: 'forge_create_vpc',
  title: 'Create VPC',
  description: 'Create a private network (VPC) at the provider in a region, to create servers in it with forge_create_server.',
  toolset: 'providers',
  operations: ['organizations.server-credentials.vpcs.store'],
  permissions: ['server:create'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  notFoundHint: 'Check the credential with forge_list_server_credentials and the region code with forge_list_provider_regions.',
  inputSchema: {
    organization: organizationInput,
    credential: credentialInput,
    region: vpcRegionInput,
    name: z.string().min(1).describe('Name of the network.'),
  },
  outputSchema: {
    vpc: vpcOutput,
  },
  async handler(args, { client, organization, signal }) {
    const response = await client.post<SingleDocument>(vpcsPath(organization(args.organization), args.credential, args.region), {
      body: { name: args.name },
      signal,
    });
    const vpc = formatVpc(flattenSingle(response.data));
    return { structured: { vpc }, summary: `Created VPC ${vpc.name} (ID ${vpc.id}, ${vpc.cidrBlock}).` };
  },
});
