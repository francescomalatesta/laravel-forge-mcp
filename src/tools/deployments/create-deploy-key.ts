import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { operationOutput } from '../shared/async.js';
import { deployKeyOutput } from './get-deploy-key.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from './shared.js';

export const createDeployKey = defineTool({
  name: 'forge_create_deploy_key',
  title: 'Create deploy key',
  description:
    'Create an SSH deploy key for the site (returns the existing key if there is one). Add the returned public key as a deploy key in the Git provider so the server can pull that repository.',
  toolset: 'deployments',
  operations: ['organizations.servers.sites.deploy-key.store'],
  permissions: ['site:manage-deploys'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  // Asynchronous in Forge, but the response already carries the key: no wait needed.
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: siteScopeInput,
  outputSchema: { ...operationOutput, ...deployKeyOutput },
  async handler(args, { client, organization, signal }) {
    const response = await client.post<SingleDocument>(
      `${sitePath(organization(args.organization), args.server, args.site)}/deploy-key`,
      { signal },
    );
    const key = response.data ? ((flattenSingle(response.data).key as string | null | undefined) ?? null) : null;
    return {
      structured: { status: key ? ('completed' as const) : ('queued' as const), check_with: 'forge_get_deploy_key', key },
      summary: key
        ? 'Deploy key ready: add this public key as a deploy key in the repository settings of the Git provider.'
        : 'Forge accepted the request; read the key with forge_get_deploy_key.',
    };
  },
});
