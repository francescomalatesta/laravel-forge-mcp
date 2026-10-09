import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { apiPath } from '../../forge/path.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, waitFor, waitInput } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { formatSite, siteOutput } from './format.js';
import { readSite, sitePhase } from './shared.js';

const CHECK_WITH = 'forge_get_site';

const node = z.object({
  server_id: z.number().int().describe('Server receiving traffic.'),
  port: z.number().int().min(1).max(65535).optional(),
  weight: z.number().int().min(1).optional().describe('Relative share of traffic.'),
  backup: z.boolean().optional().describe('Only used when the other servers are unavailable.'),
  down: z.boolean().optional().describe('Temporarily take this server out of rotation.'),
});

export const createBalancedSite = defineTool({
  name: 'forge_create_balanced_site',
  title: 'Create load-balanced site',
  description:
    'Create a site on a load balancer server that distributes traffic to sites on other servers. Waits until Forge finishes installing it unless `wait` is false.',
  toolset: 'sites',
  operations: ['organizations.servers.sites.storeOnBalancer', 'organizations.sites.show'],
  permissions: ['site:create', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  notFoundHint: 'Check the load balancer server ID with forge_list_servers (type "loadbalancer").',
  inputSchema: {
    organization: organizationInput,
    server: serverInput.describe('ID of the load balancer server.'),
    domain: z.string().min(1).describe('Domain of the site, e.g. "example.com".'),
    balancing: z.array(node).min(1).describe('Servers that receive the traffic.'),
    balancer_method: z.enum(['round_robin', 'least_conn', 'ip_hash']).optional(),
    balancer_keepalive_max_connections: z.number().int().optional(),
    allow_wildcard_subdomains: z.boolean().optional(),
    ...waitInput(300),
  },
  outputSchema: {
    ...operationOutput,
    site: siteOutput.nullable(),
  },
  async handler(args, { client, config, organization, signal, sleep, progress }) {
    const org = organization(args.organization);
    const { organization: _org, server, wait, timeout_seconds, ...body } = args;
    const created = await client.post<SingleDocument | undefined>(apiPath`/orgs/${org}/servers/${server}/sites/balancer`, {
      body,
      signal,
    });
    const initial = created.data?.data ? flattenSingle(created.data) : undefined;
    const format = (flat: Record<string, unknown>) =>
      formatSite(flat, { detailed: false, allowSecrets: config.allowSecrets, serverId: String(server) });
    const action = `create the load-balanced site "${args.domain}"`;

    if (!initial || !wait) {
      return {
        structured: { status: 'queued' as const, check_with: initial ? CHECK_WITH : 'forge_list_sites', site: initial ? format(initial) : null },
        summary: `Forge accepted the request to ${action}. Follow it with ${initial ? `${CHECK_WITH} (site ${initial.id})` : 'forge_list_sites'}.`,
      };
    }

    const result = await waitFor({
      initial,
      poll: () => readSite(client, org, initial.id, signal),
      phase: (site) => sitePhase(site.status),
      describe: (site) => `Site ${site.id} is ${site.status}`,
      timeoutSeconds: timeout_seconds,
      context: { sleep, progress },
    });
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: timeout_seconds });
    return { structured: { ...done.structured, site: format(result.value ?? initial) }, summary: done.summary };
  },
});
