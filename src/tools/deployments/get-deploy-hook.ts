import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from './shared.js';

export const deployHookOutput = {
  url: z.string().nullable().describe('Calling this URL (GET or POST) triggers a deployment. Treat it as a secret.'),
};

export const getDeployHook = defineTool({
  name: 'forge_get_deploy_hook',
  title: 'Get deploy hook URL',
  description:
    'Get the deployment trigger URL of a site, used by CI services to deploy it. Anyone with this URL can deploy the site.',
  toolset: 'deployments',
  operations: ['organizations.servers.sites.deployments.deploy-hook.show'],
  permissions: ['site:manage-deploys'],
  readOnly: true,
  exposesSecrets: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: siteScopeInput,
  outputSchema: deployHookOutput,
  async handler(args, { client, organization, signal }) {
    const response = await client.get<SingleDocument>(
      `${sitePath(organization(args.organization), args.server, args.site)}/deployments/deploy-hook`,
      { signal },
    );
    return {
      structured: { url: (flattenSingle(response.data).url as string | undefined) ?? null },
      summary: 'Deploy hook URL retrieved. Keep it secret: calling it deploys the site.',
    };
  },
});
