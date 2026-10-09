import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from '../shared/site-scope.js';

export const getSiteNginxConfig = defineTool({
  name: 'forge_get_site_nginx_config',
  title: 'Get site Nginx configuration',
  description: "Read the site's Nginx configuration file (server blocks, locations, PHP-FPM socket, SSL settings).",
  toolset: 'sites',
  operations: ['organizations.servers.sites.nginx.show'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: siteScopeInput,
  outputSchema: {
    content: z.string().nullable().describe('Nginx configuration of the site.'),
  },
  async handler(args, { client, organization, signal }) {
    const response = await client.get<SingleDocument>(
      `${sitePath(organization(args.organization), args.server, args.site)}/nginx`,
      { signal },
    );
    const content = (flattenSingle(response.data).content as string | null | undefined) ?? null;
    return {
      structured: { content },
      summary: content ? `The Nginx configuration has ${content.trimEnd().split('\n').length} line(s).` : 'No Nginx configuration found.',
    };
  },
});
