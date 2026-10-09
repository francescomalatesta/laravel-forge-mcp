import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { installationPhase, operationOutput, outcome, waitFor, waitInput } from '../shared/async.js';
import { findNew, listRecent } from '../shared/read.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { firewallRuleOutput, firewallRulesPath, formatFirewallRule } from './shared.js';

const CHECK_WITH = 'forge_list_firewall_rules';

export const createFirewallRule = defineTool({
  name: 'forge_create_firewall_rule',
  title: 'Create firewall rule',
  description:
    'Open (allow) or block (deny) a port or port range on a server, for everyone or for an IP address or subnet. Waits until the rule is installed unless `wait` is false.',
  toolset: 'security',
  operations: ['organizations.servers.firewall-rules.store', 'organizations.servers.firewall-rules.index'],
  permissions: ['server:manage-network'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    name: z.string().min(1).max(50).describe('Name of the rule, e.g. "MySQL from office".'),
    port: z.string().min(1).optional().describe('Port or range, e.g. "3306" or "8000:8010". Omit for every port.'),
    ip_address: z.string().min(1).optional().describe('IP address or subnet allowed/blocked, e.g. "203.0.113.4" or "10.0.0.0/16". Omit for any address.'),
    type: z.enum(['allow', 'deny']).default('allow'),
    ...waitInput(60),
  },
  outputSchema: {
    ...operationOutput,
    rule: firewallRuleOutput.nullable().describe('The new rule once it shows up.'),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const base = firewallRulesPath(organization(args.organization), args.server);
    // Forge returns no body: remember the existing rules with this name to spot the new one.
    const lookup = () => listRecent(client, base, signal, { sortable: true, filter: { name: args.name } });
    const existing = args.wait ? new Set((await lookup()).map((rule) => rule.id)) : undefined;
    await client.post(base, { body: { name: args.name, port: args.port, ip_address: args.ip_address, type: args.type }, signal });
    const action = `${args.type} ${args.port ? `port ${args.port}` : 'every port'}${args.ip_address ? ` from ${args.ip_address}` : ''}`;
    if (!existing) {
      return {
        structured: { status: 'queued' as const, check_with: CHECK_WITH, rule: null },
        summary: `Forge accepted the request to ${action}; it runs in the background. Check it with ${CHECK_WITH}.`,
      };
    }

    const result = await waitFor({
      poll: async () => findNew(await lookup(), existing),
      phase: (rule) => (rule ? installationPhase(rule.status) : 'pending'),
      describe: (rule) => (rule ? `Firewall rule is ${rule.status}` : 'Waiting for the rule to appear'),
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const rule = result.value ? formatFirewallRule(result.value) : null;
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds, detail: rule ? `Rule ID: ${rule.id}.` : undefined });
    return { structured: { ...done.structured, rule }, summary: done.summary };
  },
});
