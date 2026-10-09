import { defineTool } from '../define-tool.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { siteScopeInput } from '../shared/site-scope.js';
import { redirectRuleInput, redirectRulesPath } from './shared.js';

const CHECK_WITH = 'forge_list_redirect_rules';

export const deleteRedirectRule = defineTool({
  name: 'forge_delete_redirect_rule',
  title: 'Delete redirect rule',
  description: 'Remove a redirect rule from a site.',
  toolset: 'security',
  operations: ['organizations.servers.sites.redirect-rules.destroy', 'organizations.servers.sites.redirect-rules.show'],
  permissions: ['site:manage-redirects'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: 'Check the redirect rule ID with forge_list_redirect_rules.',
  inputSchema: {
    ...siteScopeInput,
    rule: redirectRuleInput,
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = `${redirectRulesPath(organization(args.organization), args.server, args.site)}/${encodeURIComponent(String(args.rule))}`;
    await client.delete(path, { signal });
    const action = `delete redirect rule ${args.rule}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => orGone(() => readResource(client, path, signal)),
      phase: (rule) => (rule === null ? 'completed' : 'pending'),
      describe: (rule) => `Redirect rule is ${rule?.status ?? 'removing'}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
