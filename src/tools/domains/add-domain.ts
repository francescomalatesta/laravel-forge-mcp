import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, waitFor, waitInput } from '../shared/async.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from '../shared/site-scope.js';
import { WWW_REDIRECT_TYPES, domainOutput, domainPhase, formatDomain, readDomain } from './shared.js';

const CHECK_WITH = 'forge_get_domain';

export const addDomain = defineTool({
  name: 'forge_add_domain',
  title: 'Add domain',
  description:
    'Add a domain (alias) to a site. Waits until Forge enables it unless `wait` is false; if it stays pending, the DNS records are probably missing: check them with forge_get_domain. Secure it afterwards with forge_create_certificate.',
  toolset: 'sites',
  operations: ['organizations.servers.sites.domains.store', 'organizations.servers.sites.domains.show'],
  permissions: ['site:meta'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    name: z.string().min(1).describe('Domain name, e.g. "www.example.com".'),
    www_redirect_type: z.enum(WWW_REDIRECT_TYPES).default('none').describe('Redirect www to non-www ("from-www"), the opposite ("to-www") or neither.'),
    allow_wildcard_subdomains: z.boolean().default(false),
    ...waitInput(120),
  },
  outputSchema: {
    ...operationOutput,
    domain: domainOutput.nullable(),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const base = `${sitePath(organization(args.organization), args.server, args.site)}/domains`;
    const response = await client.post<SingleDocument | undefined>(base, {
      body: { name: args.name, www_redirect_type: args.www_redirect_type, allow_wildcard_subdomains: args.allow_wildcard_subdomains },
      signal,
    });
    const initial = response.data?.data ? flattenSingle(response.data) : undefined;
    const action = `add the domain ${args.name}`;
    if (!initial || !args.wait) {
      return {
        structured: { status: 'queued' as const, check_with: initial ? CHECK_WITH : 'forge_list_domains', domain: initial ? formatDomain(initial) : null },
        summary: `Forge accepted the request to ${action}. Follow it with ${initial ? `${CHECK_WITH} (domain ${initial.id})` : 'forge_list_domains'}.`,
      };
    }

    const result = await waitFor({
      initial,
      poll: () => readDomain(client, `${base}/${encodeURIComponent(initial.id)}`, signal),
      phase: (domain) => domainPhase(domain.status),
      describe: (domain) => `Domain ${domain.name} is ${domain.status}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const done = outcome(result, {
      action,
      checkWith: CHECK_WITH,
      timeoutSeconds: args.timeout_seconds,
      detail: result.status === 'in_progress' ? 'Check the DNS records with forge_get_domain.' : undefined,
    });
    return { structured: { ...done.structured, domain: formatDomain(result.value ?? initial) }, summary: done.summary };
  },
});
