import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { apiPath } from '../../forge/path.js';
import { defineTool } from '../define-tool.js';
import { organizationInput, siteInput } from '../shared/schemas.js';
import { formatSite, siteOutput } from './format.js';

export const getSite = defineTool({
  name: 'forge_get_site',
  title: 'Get site',
  description:
    'Get every detail of a Forge site: status, repository and branch, PHP version, web directory, aliases, zero-downtime and push-to-deploy settings, deployment script and the hosting server. Only the site ID is needed.',
  toolset: 'core',
  operations: ['organizations.sites.show'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: 'Check the site ID with forge_list_sites.',
  inputSchema: {
    organization: organizationInput,
    site: siteInput,
  },
  outputSchema: {
    site: siteOutput,
  },
  async handler(args, { client, config, organization, signal }) {
    const org = organization(args.organization);
    const response = await client.get<SingleDocument>(apiPath`/orgs/${org}/sites/${args.site}`, { signal });
    const site = formatSite(flattenSingle(response.data), { detailed: true, allowSecrets: config.allowSecrets });
    const server = site.server_id ? ` on server ${site.server_id}` : '';
    return {
      structured: { site },
      summary: `Site "${site.name}" (${site.id})${server}: status ${site.status ?? 'unknown'}, deployment status ${site.deployment_status ?? 'unknown'}.`,
    };
  },
});
