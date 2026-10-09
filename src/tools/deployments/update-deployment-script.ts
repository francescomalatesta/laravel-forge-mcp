import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { deploymentScriptOutput } from './get-deployment-script.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from './shared.js';

export const updateDeploymentScript = defineTool({
  name: 'forge_update_deployment_script',
  title: 'Update deployment script',
  description:
    'Replace the bash script Forge runs when the site is deployed. The whole script is overwritten: read it first with forge_get_deployment_script and send the complete new version. Takes effect on the next deployment.',
  toolset: 'deployments',
  operations: ['organizations.servers.sites.deployments.script.update'],
  permissions: ['site:manage-deploys'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    content: z.string().min(1).describe('The complete new deployment script.'),
    auto_source: z
      .boolean()
      .optional()
      .describe('Source the environment variables automatically before running the script. Unchanged when omitted.'),
  },
  outputSchema: deploymentScriptOutput,
  async handler(args, { client, organization, signal }) {
    const response = await client.put<SingleDocument>(
      `${sitePath(organization(args.organization), args.server, args.site)}/deployments/script`,
      { body: { content: args.content, ...(args.auto_source !== undefined ? { auto_source: args.auto_source } : {}) }, signal },
    );
    const flat: Record<string, unknown> = response.data ? flattenSingle(response.data) : {};
    return {
      structured: {
        content: (flat.content as string | null | undefined) ?? args.content,
        auto_source: (flat.auto_source as boolean | undefined) ?? args.auto_source ?? null,
      },
      summary: 'Deployment script updated. It will be used by the next deployment (forge_deploy_site).',
    };
  },
});
