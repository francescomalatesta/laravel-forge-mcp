import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { DOMAIN_NOT_FOUND_HINT, WWW_REDIRECT_TYPES, domainOutput, domainPath, domainPhase, domainScopeInput, formatDomain, readDomain } from './shared.js';

const CHECK_WITH = 'forge_get_domain';

export const updateDomain = defineTool({
  name: 'forge_update_domain',
  title: 'Update domain',
  description: "Change a domain's www redirection and wildcard subdomain setting.",
  toolset: 'sites',
  operations: ['organizations.servers.sites.domains.update', 'organizations.servers.sites.domains.show'],
  permissions: ['site:meta'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: DOMAIN_NOT_FOUND_HINT,
  inputSchema: {
    ...domainScopeInput,
    www_redirect_type: z.enum(WWW_REDIRECT_TYPES).describe('Redirect www to non-www ("from-www"), the opposite ("to-www") or neither.'),
    allow_wildcard_subdomains: z.boolean().optional(),
    ...waitInput(60),
  },
  outputSchema: {
    ...operationOutput,
    domain: domainOutput.nullable(),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = domainPath(organization(args.organization), args.server, args.site, args.domain);
    const response = await client.patch<SingleDocument | undefined>(path, {
      body: { www_redirect_type: args.www_redirect_type, allow_wildcard_subdomains: args.allow_wildcard_subdomains },
      signal,
    });
    const initial = response.data?.data ? flattenSingle(response.data) : undefined;
    const action = 'update the domain';
    if (!args.wait) {
      const accepted = queued(action, CHECK_WITH);
      return { ...accepted, structured: { ...accepted.structured, domain: initial ? formatDomain(initial) : null } };
    }

    const applied = (domain: Record<string, unknown>) =>
      domain.www_redirect_type === args.www_redirect_type &&
      (args.allow_wildcard_subdomains === undefined || domain.allow_wildcard_subdomains === args.allow_wildcard_subdomains);
    const result = await waitFor({
      ...(initial ? { initial } : {}),
      poll: () => readDomain(client, path, signal),
      phase: (domain) => (applied(domain) ? domainPhase(domain.status) : 'pending'),
      describe: (domain) => `Domain ${domain.name} is ${domain.status}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
    const latest = result.value ?? initial;
    return { structured: { ...done.structured, domain: latest ? formatDomain(latest) : null }, summary: done.summary };
  },
});
