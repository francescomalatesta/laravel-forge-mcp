import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from '../shared/site-scope.js';

export const getSiteEnvironment = defineTool({
  name: 'forge_get_site_environment',
  title: 'Get site .env',
  description:
    "Read the site's .env file. It contains secrets (database passwords, API keys): only share what the user needs. To change a few variables without reading the file, use forge_set_site_env_vars.",
  toolset: 'sites',
  operations: ['organizations.servers.sites.environment.show'],
  permissions: ['server:view'],
  readOnly: true,
  exposesSecrets: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: siteScopeInput,
  outputSchema: {
    content: z.string().nullable().describe('Content of the .env file.'),
  },
  async handler(args, { client, organization, signal }) {
    const response = await client.get<SingleDocument>(
      `${sitePath(organization(args.organization), args.server, args.site)}/environment`,
      { signal },
    );
    const content = (flattenSingle(response.data).content as string | null | undefined) ?? null;
    return {
      structured: { content },
      summary: content ? `The .env file has ${content.trimEnd().split('\n').length} line(s).` : 'The site has no .env content.',
    };
  },
});
