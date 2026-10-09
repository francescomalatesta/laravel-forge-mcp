import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { deployHookOutput } from './get-deploy-hook.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from './shared.js';

export const regenerateDeployHook = defineTool({
  name: 'forge_regenerate_deploy_hook',
  title: 'Regenerate deploy hook URL',
  description:
    'Generate a new deployment trigger URL for a site, e.g. after it leaked. The previous URL stops working immediately: CI pipelines using it must be updated.',
  toolset: 'deployments',
  operations: ['organizations.servers.sites.deployments.deploy-hook.update'],
  permissions: ['site:manage-deploys'],
  readOnly: false,
  destructive: true,
  idempotent: false,
  exposesSecrets: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: siteScopeInput,
  outputSchema: deployHookOutput,
  async handler(args, { client, organization, signal }) {
    const response = await client.put<SingleDocument>(
      `${sitePath(organization(args.organization), args.server, args.site)}/deployments/deploy-hook`,
      { signal },
    );
    return {
      structured: { url: (flattenSingle(response.data).url as string | undefined) ?? null },
      summary: 'A new deploy hook URL was generated; the previous one no longer works.',
    };
  },
});
