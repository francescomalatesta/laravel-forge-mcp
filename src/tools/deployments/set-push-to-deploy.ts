import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { queued, queuedOutput } from '../shared/async.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from './shared.js';

export const setPushToDeploy = defineTool({
  name: 'forge_set_push_to_deploy',
  title: 'Enable or disable push to deploy',
  description:
    'Enable or disable "push to deploy" (quick deploy): when enabled, Forge deploys the site automatically on every push to its repository branch.',
  toolset: 'deployments',
  operations: [
    'organizations.servers.sites.deployments.push-to-deploy.store',
    'organizations.servers.sites.deployments.push-to-deploy.destroy',
  ],
  permissions: ['site:manage-deploys'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    enabled: z.boolean().describe('true to enable push to deploy, false to disable it.'),
  },
  outputSchema: queuedOutput,
  async handler(args, { client, organization, signal }) {
    const path = `${sitePath(organization(args.organization), args.server, args.site)}/deployments/push-to-deploy`;
    if (args.enabled) {
      await client.post(path, { signal });
    } else {
      await client.delete(path, { signal });
    }
    return queued(`${args.enabled ? 'enable' : 'disable'} push to deploy`, 'forge_get_site', '(field `quick_deploy`)');
  },
});
