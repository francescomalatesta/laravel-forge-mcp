import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput } from '../shared/site-scope.js';
import {
  credentialKeyInput,
  credentialOperations,
  credentialOutput,
  credentialPath,
  credentialsPath,
  formatCredential,
  managerInput,
} from './shared.js';

export const listPackageCredentials = defineTool({
  name: 'forge_list_package_credentials',
  title: 'List package credentials',
  description:
    'List the credentials a site uses to install private Composer or npm packages (auth.json / .npmrc), or get one with `repository`. Passwords and tokens are hidden unless secrets are allowed.',
  toolset: 'sites',
  operations: [...credentialOperations('index'), ...credentialOperations('show')],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    manager: managerInput,
    repository: credentialKeyInput.optional().describe('Return only the credentials of this repository or registry.'),
  },
  outputSchema: {
    credentials: z.array(credentialOutput),
  },
  async handler(args, { client, config, organization, signal }) {
    const org = organization(args.organization);
    const format = (flat: Record<string, unknown>) => formatCredential(args.manager, flat, config.allowSecrets);
    if (args.repository !== undefined) {
      const credential = format(await readResource(client, credentialPath(org, args.server, args.site, args.manager, args.repository), signal));
      return { structured: { credentials: [credential] }, summary: `Credentials for ${credential.repository}.` };
    }
    // The endpoint is not paginated: it returns every credential of the site.
    const response = await client.get<CollectionDocument>(credentialsPath(org, args.server, args.site, args.manager), { signal });
    const page = flattenCollection(response.data);
    const credentials = page.items.map(format);
    return {
      structured: { credentials },
      summary:
        credentials.length === 0
          ? `No ${args.manager} credentials found.`
          : `Found ${args.manager} credentials for: ${credentials.map((c) => c.repository).join(', ')}.`,
    };
  },
});
