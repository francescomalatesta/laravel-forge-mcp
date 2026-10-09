import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from '../shared/site-scope.js';
import { siteLogInput } from './logs.js';

const CHECK_WITH = 'forge_get_site_log';

export const clearSiteLog = defineTool({
  name: 'forge_clear_site_log',
  title: 'Clear site log',
  description: 'Empty a site log (application, Nginx access or Nginx error). The previous content is lost.',
  toolset: 'sites',
  operations: [
    'organizations.servers.sites.logs.application.destroy',
    'organizations.servers.sites.logs.nginx-access.destroy',
    'organizations.servers.sites.logs.nginx-error.destroy',
    'organizations.servers.sites.logs.application.show',
    'organizations.servers.sites.logs.nginx-access.show',
    'organizations.servers.sites.logs.nginx-error.show',
  ],
  permissions: ['server:manage-logs'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    log: siteLogInput,
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = `${sitePath(organization(args.organization), args.server, args.site)}/logs/${args.log}`;
    await client.delete(path, { signal });
    const action = `clear the ${args.log} log`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: async () => {
        const response = await client.get<SingleDocument>(path, { signal });
        return ((flattenSingle(response.data).content as string | null | undefined) ?? '').trim();
      },
      phase: (content) => (content === '' ? 'completed' : 'pending'),
      describe: () => `Waiting for the ${args.log} log to be cleared`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
