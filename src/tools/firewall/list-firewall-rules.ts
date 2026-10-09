import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { organizationInput, paginationInput, paginationOutput, paginationSummary, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { firewallRuleInput, firewallRuleOutput, firewallRulesPath, formatFirewallRule } from './shared.js';

const SORT = ['created_at', '-created_at', 'updated_at', '-updated_at'] as const;

export const listFirewallRules = defineTool({
  name: 'forge_list_firewall_rules',
  title: 'List firewall rules',
  description: 'List the firewall rules of a server (which ports are open to which addresses), or get one with `rule`.',
  toolset: 'security',
  operations: ['organizations.servers.firewall-rules.index', 'organizations.servers.firewall-rules.show'],
  permissions: ['server:manage-network'],
  readOnly: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    rule: firewallRuleInput.optional().describe('Return only this rule.'),
    name: z.string().min(1).optional().describe('Filter by name.'),
    port: z.string().min(1).optional().describe('Filter by port, e.g. "3306".'),
    ip_address: z.string().min(1).optional().describe('Filter by IP address or subnet.'),
    type: z.enum(['allow', 'deny']).optional().describe('Filter by type.'),
    status: z.string().min(1).optional().describe('Filter by status, e.g. "installed".'),
    sort: z.array(z.enum(SORT)).min(1).optional(),
    ...paginationInput,
  },
  outputSchema: {
    rules: z.array(firewallRuleOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const base = firewallRulesPath(organization(args.organization), args.server);
    if (args.rule !== undefined) {
      const rule = formatFirewallRule(await readResource(client, `${base}/${encodeURIComponent(String(args.rule))}`, signal));
      return { structured: { rules: [rule], next_cursor: null, has_more: false }, summary: `Firewall rule ${rule.name} is ${rule.status}.` };
    }
    const response = await client.get<CollectionDocument>(base, {
      query: {
        filter: { name: args.name, port: args.port, ip_address: args.ip_address, type: args.type, status: args.status },
        sort: args.sort,
        page: { size: args.page_size, cursor: args.cursor },
      },
      signal,
    });
    const page = flattenCollection(response.data);
    const rules = page.items.map(formatFirewallRule);
    return {
      structured: { rules, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        rules.length === 0
          ? 'No firewall rules found.'
          : `Found ${rules.length} firewall rule(s): ${rules
              .map((r) => `${r.type} ${r.port ?? 'all ports'} from ${r.ip_address ?? 'anywhere'} (${r.id})`)
              .join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
