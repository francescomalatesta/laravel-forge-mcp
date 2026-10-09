import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { siteScopeInput } from '../shared/site-scope.js';
import { nodeOutput, nodesPath, readNodes } from './shared.js';

export const getLoadBalancer = defineTool({
  name: 'forge_get_load_balancer',
  title: 'Get load balancer nodes',
  description: 'List the servers a load-balanced site sends traffic to, with weight, port and backup/down flags.',
  toolset: 'sites',
  operations: ['organizations.servers.sites.load-balancing-nodes.index'],
  permissions: ['site:manage-project'],
  readOnly: true,
  notFoundHint: 'Check the load balancer server and site IDs with forge_list_sites.',
  inputSchema: {
    ...siteScopeInput,
  },
  outputSchema: {
    nodes: z.array(nodeOutput),
  },
  async handler(args, { client, organization, signal }) {
    const nodes = await readNodes(client, nodesPath(organization(args.organization), args.server, args.site), signal);
    return {
      structured: { nodes },
      summary:
        nodes.length === 0
          ? 'This site has no load balancing nodes.'
          : `Traffic goes to server(s) ${nodes.map((n) => `${n.server_id} (weight ${n.weight}${n.down ? ', down' : ''}${n.backup ? ', backup' : ''})`).join(', ')}.`,
    };
  },
});
