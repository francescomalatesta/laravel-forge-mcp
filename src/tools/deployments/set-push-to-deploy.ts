import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { apiPath } from '../../forge/path.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from './shared.js';

const CHECK_WITH = 'forge_get_site';

export const setPushToDeploy = defineTool({
  name: 'forge_set_push_to_deploy',
  title: 'Enable or disable push to deploy',
  description:
    'Enable or disable "push to deploy" (quick deploy): when enabled, Forge deploys the site automatically on every push to its repository branch.',
  toolset: 'deployments',
  operations: [
    'organizations.servers.sites.deployments.push-to-deploy.store',
    'organizations.servers.sites.deployments.push-to-deploy.destroy',
    'organizations.sites.show',
  ],
  permissions: ['site:manage-deploys', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    enabled: z.boolean().describe('true to enable push to deploy, false to disable it.'),
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const org = organization(args.organization);
    const path = `${sitePath(org, args.server, args.site)}/deployments/push-to-deploy`;
    if (args.enabled) {
      await client.post(path, { signal });
    } else {
      await client.delete(path, { signal });
    }
    const action = `${args.enabled ? 'enable' : 'disable'} push to deploy`;
    if (!args.wait) return queued(action, CHECK_WITH, '(field `quick_deploy`)');

    const result = await waitFor({
      poll: async () => {
        const response = await client.get<SingleDocument>(apiPath`/orgs/${org}/sites/${args.site}`, { signal });
        return (flattenSingle(response.data).quick_deploy as boolean | null | undefined) ?? null;
      },
      phase: (quickDeploy) => (quickDeploy === args.enabled ? 'completed' : 'pending'),
      describe: () => `Waiting for push to deploy to be ${args.enabled ? 'enabled' : 'disabled'}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
