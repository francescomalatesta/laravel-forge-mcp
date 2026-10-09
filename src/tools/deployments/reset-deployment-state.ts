import { defineTool } from '../define-tool.js';
import { queued, queuedOutput } from '../shared/async.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from './shared.js';

export const resetDeploymentState = defineTool({
  name: 'forge_reset_deployment_state',
  title: 'Reset deployment state',
  description:
    'Clear the "deploying" state of a site when a deployment is stuck (e.g. the server was rebooted mid-deploy) so new deployments can run. It does not stop a running process or roll back code.',
  toolset: 'deployments',
  operations: ['organizations.servers.sites.deployments.status.destroy'],
  permissions: ['site:manage-deploys'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: siteScopeInput,
  outputSchema: queuedOutput,
  async handler(args, { client, organization, signal }) {
    await client.delete(`${sitePath(organization(args.organization), args.server, args.site)}/deployments/status`, { signal });
    return queued('reset the deployment state', 'forge_get_deployment_status');
  },
});
