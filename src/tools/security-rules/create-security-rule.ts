import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { installationPhase, operationOutput, outcome, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput } from '../shared/site-scope.js';
import { credentialsInput, formatSecurityRule, securityRuleOutput, securityRulesPath } from './shared.js';

const CHECK_WITH = 'forge_list_security_rules';

export const createSecurityRule = defineTool({
  name: 'forge_create_security_rule',
  title: 'Create security rule',
  description:
    'Password-protect a site, or one path of it, with HTTP basic auth (e.g. a staging site or /admin). Waits until the rule is installed unless `wait` is false.',
  toolset: 'security',
  operations: ['organizations.servers.sites.security-rules.store', 'organizations.servers.sites.security-rules.show'],
  permissions: ['site:manage-security'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    name: z.string().min(1).max(255).describe('Name of the rule, e.g. "Staging access".'),
    path: z.string().min(1).max(255).optional().describe('Path to protect, e.g. "/admin". Omit to protect the whole site.'),
    credentials: credentialsInput,
    ...waitInput(60),
  },
  outputSchema: {
    ...operationOutput,
    rule: securityRuleOutput.nullable(),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const base = securityRulesPath(organization(args.organization), args.server, args.site);
    const response = await client.post<SingleDocument | undefined>(base, {
      body: { name: args.name, path: args.path, credentials: args.credentials },
      signal,
    });
    const initial = response.data?.data ? flattenSingle(response.data) : undefined;
    const action = `protect ${args.path ?? 'the site'} with a password`;
    if (!initial || !args.wait) {
      return {
        structured: { status: 'queued' as const, check_with: CHECK_WITH, rule: initial ? formatSecurityRule(initial) : null },
        summary: `Forge accepted the request to ${action}. Check it with ${CHECK_WITH}.`,
      };
    }

    const result = await waitFor({
      initial,
      poll: () => readResource(client, `${base}/${encodeURIComponent(initial.id)}`, signal),
      phase: (rule) => installationPhase(rule.status),
      describe: (rule) => `Security rule is ${rule.status}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const rule = formatSecurityRule(result.value ?? initial);
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds, detail: `Rule ID: ${rule.id}.` });
    return { structured: { ...done.structured, rule }, summary: done.summary };
  },
});
