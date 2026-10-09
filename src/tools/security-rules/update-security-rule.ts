import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { installationPhase, operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { siteScopeInput } from '../shared/site-scope.js';
import { credentialsInput, formatSecurityRule, SECURITY_RULE_NOT_FOUND_HINT, securityRuleInput, securityRuleOutput, securityRulesPath } from './shared.js';

const CHECK_WITH = 'forge_list_security_rules';

export const updateSecurityRule = defineTool({
  name: 'forge_update_security_rule',
  title: 'Update security rule',
  description:
    'Change the name, protected path or users of a security rule. Forge cannot return the current passwords, so `credentials` must list every user that should keep access.',
  toolset: 'security',
  operations: ['organizations.servers.sites.security-rules.update', 'organizations.servers.sites.security-rules.show'],
  permissions: ['site:manage-security'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: SECURITY_RULE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    rule: securityRuleInput,
    credentials: credentialsInput.describe('Every user allowed through the password prompt (replaces the list).'),
    name: z.string().min(1).max(255).optional().describe('New name.'),
    path: z.string().min(1).max(255).nullable().optional().describe('New protected path; null protects the whole site.'),
    ...waitInput(60),
  },
  outputSchema: {
    ...operationOutput,
    rule: securityRuleOutput.nullable(),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = `${securityRulesPath(organization(args.organization), args.server, args.site)}/${encodeURIComponent(String(args.rule))}`;
    const current = await readResource(client, path, signal);
    const name = args.name ?? current.name;
    const protectedPath = args.path === undefined ? current.path : args.path;
    await client.put(path, { body: { name, path: protectedPath, credentials: args.credentials }, signal });

    const action = `update security rule ${args.rule}`;
    const changed = (args.name !== undefined && args.name !== current.name) || (args.path !== undefined && args.path !== current.path);
    if (!args.wait || !changed) {
      // Credentials are never returned: only name and path changes can be verified.
      const accepted = queued(action, CHECK_WITH, changed ? undefined : '(credentials are never returned, so the change cannot be verified)');
      return { ...accepted, structured: { ...accepted.structured, rule: null } };
    }

    const result = await waitFor({
      poll: () => readResource(client, path, signal),
      phase: (rule) => {
        const phase = installationPhase(rule.status);
        return phase === 'completed' && (rule.name !== name || (rule.path ?? null) !== (protectedPath ?? null)) ? 'pending' : phase;
      },
      describe: (rule) => `Security rule is ${rule.status}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
    return { structured: { ...done.structured, rule: result.value ? formatSecurityRule(result.value) : null }, summary: done.summary };
  },
});
