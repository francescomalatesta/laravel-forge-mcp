import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { installationPhase, operationOutput, outcome, waitFor, waitInput } from '../shared/async.js';
import { findNew, listNewestFirst } from '../shared/read.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput } from '../shared/site-scope.js';
import { formatRedirectRule, redirectRuleOutput, redirectRulesPath, redirectTypeInput } from './shared.js';

const CHECK_WITH = 'forge_list_redirect_rules';

export const createRedirectRule = defineTool({
  name: 'forge_create_redirect_rule',
  title: 'Create redirect rule',
  description:
    'Redirect a path of the site to another path or URL (Nginx rewrite). Waits until the rule is installed unless `wait` is false. For many rules use forge_import_redirect_rules.',
  toolset: 'security',
  operations: ['organizations.servers.sites.redirect-rules.store', 'organizations.servers.sites.redirect-rules.index'],
  permissions: ['site:manage-redirects'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    from: z.string().min(1).describe('Source path, e.g. "/old-page".'),
    to: z.string().min(1).describe('Destination path or URL, e.g. "/new-page" or "https://example.com/".'),
    type: redirectTypeInput.default('permanent'),
    ...waitInput(60),
  },
  outputSchema: {
    ...operationOutput,
    rule: redirectRuleOutput.nullable().describe('The new rule once it shows up.'),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const base = redirectRulesPath(organization(args.organization), args.server, args.site);
    // Forge returns no body: remember the existing rules for this path to spot the new one.
    const lookup = () => listNewestFirst(client, base, signal, { from: args.from });
    const existing = args.wait ? new Set((await lookup()).map((rule) => rule.id)) : undefined;
    await client.post(base, { body: { from: args.from, to: args.to, type: args.type }, signal });
    const action = `redirect ${args.from} to ${args.to}`;
    if (!existing) {
      return {
        structured: { status: 'queued' as const, check_with: CHECK_WITH, rule: null },
        summary: `Forge accepted the request to ${action}; it runs in the background. Check it with ${CHECK_WITH}.`,
      };
    }

    const result = await waitFor({
      poll: async () => findNew(await lookup(), existing),
      phase: (rule) => (rule ? installationPhase(rule.status) : 'pending'),
      describe: (rule) => (rule ? `Redirect rule is ${rule.status}` : 'Waiting for the rule to appear'),
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const rule = result.value ? formatRedirectRule(result.value) : null;
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds, detail: rule ? `Rule ID: ${rule.id}.` : undefined });
    return { structured: { ...done.structured, rule }, summary: done.summary };
  },
});
