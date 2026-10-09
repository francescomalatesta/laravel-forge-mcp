import { defineTool } from '../define-tool.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { DOMAIN_NOT_FOUND_HINT, domainPath, domainScopeInput, readDomain } from './shared.js';

const CHECK_WITH = 'forge_list_domains';

export const deleteDomain = defineTool({
  name: 'forge_delete_domain',
  title: 'Delete domain',
  description: 'Remove a domain (alias) from a site, together with its certificates. The site stops answering on that domain.',
  toolset: 'sites',
  operations: ['organizations.servers.sites.domains.destroy', 'organizations.servers.sites.domains.show'],
  permissions: ['site:meta'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: DOMAIN_NOT_FOUND_HINT,
  inputSchema: {
    ...domainScopeInput,
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = domainPath(organization(args.organization), args.server, args.site, args.domain);
    await client.delete(path, { signal });
    const action = `delete domain ${args.domain}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => orGone(() => readDomain(client, path, signal)),
      phase: (domain) => (domain === null ? 'completed' : 'pending'),
      describe: (domain) => `Domain is ${domain?.status ?? 'removing'}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
