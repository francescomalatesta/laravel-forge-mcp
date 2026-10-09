import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { siteScopeInput } from '../shared/site-scope.js';
import { nodeOutput, nodesPath, readNodes, type NodeOutput } from './shared.js';

const CHECK_WITH = 'forge_get_load_balancer';

const node = z.object({
  server_id: z.number().int().describe('Server receiving traffic.'),
  port: z.number().int().min(1).max(65535).optional(),
  weight: z.number().int().min(1).default(1).describe('Relative share of traffic.'),
  backup: z.boolean().default(false).describe('Only used when the other servers are unavailable.'),
  down: z.boolean().default(false).describe('Take this server out of rotation (e.g. for maintenance).'),
});

export const updateLoadBalancer = defineTool({
  name: 'forge_update_load_balancer',
  title: 'Update load balancer nodes',
  description:
    'Replace the servers a load-balanced site sends traffic to, with the balancing method. Set `down: true` on a node to take it out of rotation. List every node that should stay.',
  toolset: 'sites',
  operations: ['organizations.servers.sites.load-balancing-nodes.update', 'organizations.servers.sites.load-balancing-nodes.index'],
  permissions: ['site:manage-project'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: 'Check the load balancer server and site IDs with forge_list_sites.',
  inputSchema: {
    ...siteScopeInput,
    nodes: z.array(node).min(1).describe('Every server that should receive traffic (replaces the list).'),
    method: z.enum(['round_robin', 'least_conn', 'ip_hash']).default('round_robin').describe('Balancing method; ip_hash keeps each client on the same server.'),
    keepalive_max_connections: z.number().int().min(0).max(256).optional().describe('Idle keepalive connections kept open to each server.'),
    ...waitInput(60),
  },
  outputSchema: {
    ...operationOutput,
    nodes: z.array(nodeOutput).nullable(),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = nodesPath(organization(args.organization), args.server, args.site);
    await client.put(path, {
      body: { balancer_method: args.method, balancer_keepalive_max_connections: args.keepalive_max_connections, balancing: args.nodes },
      signal,
    });
    const action = 'update the load balancer';
    if (!args.wait) {
      const accepted = queued(action, CHECK_WITH);
      return { ...accepted, structured: { ...accepted.structured, nodes: null } };
    }

    const key = (n: { server_id: unknown; weight: unknown; backup: unknown; down: unknown }) => `${n.server_id}:${n.weight}:${n.backup}:${n.down}`;
    const expected = args.nodes.map(key).sort().join();
    const matches = (nodes: NodeOutput[]) => nodes.map(key).sort().join() === expected;
    const result = await waitFor({
      poll: () => readNodes(client, path, signal),
      phase: (nodes) => (matches(nodes) ? 'completed' : 'pending'),
      describe: () => 'Waiting for the nodes to be updated',
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
    return { structured: { ...done.structured, nodes: result.value ?? null }, summary: done.summary };
  },
});
