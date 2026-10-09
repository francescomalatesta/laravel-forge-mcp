import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { domainInput } from '../domains/shared.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from '../shared/site-scope.js';

const CHECK_WITH = 'forge_get_site_nginx_config';

export const updateSiteNginxConfig = defineTool({
  name: 'forge_update_site_nginx_config',
  title: 'Replace site Nginx configuration',
  description:
    "Replace the whole Nginx configuration of a site, or of one of its domains with `domain`, and reload Nginx. Read it first with forge_get_site_nginx_config and send the complete new file: an invalid configuration can take the site (or every site on the server) offline.",
  toolset: 'sites',
  operations: [
    'organizations.servers.sites.nginx.update',
    'organizations.servers.sites.nginx.show',
    'organizations.servers.sites.domains.nginx.update',
    'organizations.servers.sites.domains.nginx.show',
  ],
  permissions: ['site:manage-nginx', 'server:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    domain: domainInput.optional().describe('Replace the configuration of this domain instead of the site.'),
    config: z.string().min(1).describe('The complete new Nginx configuration.'),
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const site = sitePath(organization(args.organization), args.server, args.site);
    const path = `${args.domain === undefined ? site : `${site}/domains/${encodeURIComponent(String(args.domain))}`}/nginx`;
    await client.put(path, { body: { config: args.config }, signal });
    const action = 'update the Nginx configuration';
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: async () => {
        const response = await client.get<SingleDocument>(path, { signal });
        return (flattenSingle(response.data).content as string | null | undefined) ?? '';
      },
      phase: (content) => (content.trimEnd() === args.config.trimEnd() ? 'completed' : 'pending'),
      describe: () => 'Waiting for Forge to apply the Nginx configuration',
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, {
      action,
      checkWith: CHECK_WITH,
      timeoutSeconds: args.timeout_seconds,
      detail: result.status === 'in_progress' ? 'If Nginx rejected the file, check forge_list_server_events.' : undefined,
    });
  },
});
