import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { DOMAIN_NOT_FOUND_HINT, domainPath, domainScopeInput, readDomain } from './shared.js';

const CHECK_WITH = 'forge_get_domain';

/** What the domain looks like once each action is done. */
const DONE: Record<'enable' | 'disable' | 'mark-as-primary', (domain: Record<string, unknown>) => boolean> = {
  enable: (domain) => domain.status === 'enabled',
  disable: (domain) => domain.status === 'disabled',
  'mark-as-primary': (domain) => domain.type === 'primary',
};

export const runDomainAction = defineTool({
  name: 'forge_run_domain_action',
  title: 'Enable, disable or make a domain primary',
  description:
    'Run an action on a domain: "enable" or "disable" it, or "mark-as-primary" to make it the main domain of the site (the previous primary becomes an alias).',
  toolset: 'sites',
  operations: ['organizations.servers.sites.domains.actions.store', 'organizations.servers.sites.domains.show'],
  permissions: ['site:meta'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: DOMAIN_NOT_FOUND_HINT,
  inputSchema: {
    ...domainScopeInput,
    action: z.enum(['enable', 'disable', 'mark-as-primary']),
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = domainPath(organization(args.organization), args.server, args.site, args.domain);
    await client.post(`${path}/actions`, { body: { action: args.action }, signal });
    const action = `${args.action.replace(/-/g, ' ')} domain ${args.domain}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => readDomain(client, path, signal),
      phase: (domain) => (DONE[args.action](domain) ? 'completed' : 'pending'),
      describe: (domain) => `Domain ${domain.name} is ${domain.status}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
