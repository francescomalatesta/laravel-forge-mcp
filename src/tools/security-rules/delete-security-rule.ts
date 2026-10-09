import { defineTool } from '../define-tool.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { siteScopeInput } from '../shared/site-scope.js';
import { SECURITY_RULE_NOT_FOUND_HINT, securityRuleInput, securityRulesPath } from './shared.js';

const CHECK_WITH = 'forge_list_security_rules';

export const deleteSecurityRule = defineTool({
  name: 'forge_delete_security_rule',
  title: 'Delete security rule',
  description: 'Remove the password protection of a security rule: the path becomes public.',
  toolset: 'security',
  operations: ['organizations.servers.sites.security-rules.destroy', 'organizations.servers.sites.security-rules.show'],
  permissions: ['site:manage-security'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: SECURITY_RULE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    rule: securityRuleInput,
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = `${securityRulesPath(organization(args.organization), args.server, args.site)}/${encodeURIComponent(String(args.rule))}`;
    await client.delete(path, { signal });
    const action = `delete security rule ${args.rule}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => orGone(() => readResource(client, path, signal)),
      phase: (rule) => (rule === null ? 'completed' : 'pending'),
      describe: (rule) => `Security rule is ${rule?.status ?? 'removing'}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
