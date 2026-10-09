import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from './shared.js';

export const deleteDeployKey = defineTool({
  name: 'forge_delete_deploy_key',
  title: 'Delete deploy key',
  description:
    "Remove the site's SSH deploy key. Deployments will fail if the repository is only reachable through this key.",
  toolset: 'deployments',
  operations: ['organizations.servers.sites.deploy-key.destroy'],
  permissions: ['site:manage-deploys'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: siteScopeInput,
  outputSchema: {
    deleted: z.boolean(),
  },
  async handler(args, { client, organization, signal }) {
    await client.delete(`${sitePath(organization(args.organization), args.server, args.site)}/deploy-key`, { signal });
    return { structured: { deleted: true }, summary: 'Deploy key removed from the site.' };
  },
});
