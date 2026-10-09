import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from './shared.js';

export const deploymentScriptOutput = {
  content: z.string().nullable().describe('The deployment script (bash).'),
  auto_source: z.boolean().nullable().describe('Whether environment variables are sourced automatically before the script runs.'),
};

export const getDeploymentScript = defineTool({
  name: 'forge_get_deployment_script',
  title: 'Get deployment script',
  description: 'Get the bash script Forge runs when the site is deployed.',
  toolset: 'deployments',
  operations: ['organizations.servers.sites.deployments.script.show'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: siteScopeInput,
  outputSchema: deploymentScriptOutput,
  async handler(args, { client, organization, signal }) {
    const response = await client.get<SingleDocument>(
      `${sitePath(organization(args.organization), args.server, args.site)}/deployments/script`,
      { signal },
    );
    const flat = flattenSingle(response.data);
    const content = (flat.content as string | null | undefined) ?? null;
    return {
      structured: { content, auto_source: (flat.auto_source as boolean | undefined) ?? null },
      summary: content ? `The deployment script has ${content.split('\n').length} line(s).` : 'The site has no deployment script.',
    };
  },
});
