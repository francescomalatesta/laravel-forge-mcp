import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from './shared.js';

const CHECK_WITH = 'forge_get_deployment_status';

export const resetDeploymentState = defineTool({
  name: 'forge_reset_deployment_state',
  title: 'Reset deployment state',
  description:
    'Clear the "deploying" state of a site when a deployment is stuck (e.g. the server was rebooted mid-deploy) so new deployments can run. It does not stop a running process or roll back code.',
  toolset: 'deployments',
  operations: [
    'organizations.servers.sites.deployments.status.destroy',
    'organizations.servers.sites.deployments.status.show',
  ],
  permissions: ['site:manage-deploys', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const base = `${sitePath(organization(args.organization), args.server, args.site)}/deployments/status`;
    await client.delete(base, { signal });
    if (!args.wait) return queued('reset the deployment state', CHECK_WITH);

    const result = await waitFor({
      poll: async () => {
        const response = await client.get<SingleDocument>(base, { signal });
        return (flattenSingle(response.data).status as string | null | undefined) ?? null;
      },
      // The reset is done when the site no longer reports a deployment in progress.
      phase: (status) => (status === null ? 'completed' : 'pending'),
      describe: (status) => `Deployment state is still ${status}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action: 'reset the deployment state', checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
