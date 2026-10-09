import { defineTool } from '../define-tool.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { FIREWALL_RULE_NOT_FOUND_HINT, firewallRuleInput, firewallRulesPath } from './shared.js';

const CHECK_WITH = 'forge_list_firewall_rules';

export const deleteFirewallRule = defineTool({
  name: 'forge_delete_firewall_rule',
  title: 'Delete firewall rule',
  description: 'Remove a firewall rule from a server. Removing an allow rule closes the port: check that nothing (SSH, HTTP) depends on it.',
  toolset: 'security',
  operations: ['organizations.servers.firewall-rules.destroy', 'organizations.servers.firewall-rules.show'],
  permissions: ['server:manage-network'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: FIREWALL_RULE_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    rule: firewallRuleInput,
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = `${firewallRulesPath(organization(args.organization), args.server)}/${encodeURIComponent(String(args.rule))}`;
    await client.delete(path, { signal });
    const action = `delete firewall rule ${args.rule}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => orGone(() => readResource(client, path, signal)),
      phase: (rule) => (rule === null ? 'completed' : 'pending'),
      describe: (rule) => `Firewall rule is ${rule?.status ?? 'removing'}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
