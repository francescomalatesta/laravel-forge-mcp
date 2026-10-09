import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from './shared.js';

export const deployKeyOutput = {
  key: z.string().nullable().describe('Public SSH key to add as a read-only deploy key in the Git provider, or null if none.'),
};

export const getDeployKey = defineTool({
  name: 'forge_get_deploy_key',
  title: 'Get deploy key',
  description:
    "Get the site's public SSH deploy key, which grants the server access to a single repository. Create one with forge_create_deploy_key.",
  toolset: 'deployments',
  operations: ['organizations.servers.sites.deploy-key.show'],
  permissions: ['site:manage-deploys'],
  readOnly: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: siteScopeInput,
  outputSchema: deployKeyOutput,
  async handler(args, { client, organization, signal }) {
    const response = await client.get<SingleDocument>(
      `${sitePath(organization(args.organization), args.server, args.site)}/deploy-key`,
      { signal },
    );
    const key = (flattenSingle(response.data).key as string | null | undefined) ?? null;
    return {
      structured: { key },
      summary: key ? 'The site has a deploy key.' : 'The site has no deploy key; create one with forge_create_deploy_key.',
    };
  },
});
