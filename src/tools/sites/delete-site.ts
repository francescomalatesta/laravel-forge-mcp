import { defineTool } from '../define-tool.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from '../shared/site-scope.js';
import { readSite } from './shared.js';

const CHECK_WITH = 'forge_list_sites';

export const deleteSite = defineTool({
  name: 'forge_delete_site',
  title: 'Delete site',
  description:
    'Permanently delete a site from its server, including its files, Nginx configuration and certificates. Databases are kept. This cannot be undone.',
  toolset: 'sites',
  operations: ['organizations.servers.sites.destroy', 'organizations.sites.show'],
  permissions: ['site:delete', 'server:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    ...waitInput(120),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const org = organization(args.organization);
    await client.delete(sitePath(org, args.server, args.site), { signal });
    const action = `delete site ${args.site}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => orGone(() => readSite(client, org, args.site, signal)),
      phase: (site) => (site === null ? 'completed' : 'pending'),
      describe: (site) => `Site is ${site?.status ?? 'removing'}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
