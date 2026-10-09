import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { operationOutput, queued } from '../shared/async.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput } from '../shared/site-scope.js';
import { redirectRulesPath } from './shared.js';

export const reorderRedirectRules = defineTool({
  name: 'forge_reorder_redirect_rules',
  title: 'Reorder redirect rules',
  description:
    'Set the order in which Nginx evaluates the redirect rules of a site (the first match wins), by listing their IDs in the desired order. IDs that do not belong to the site are ignored.',
  toolset: 'security',
  operations: ['organizations.servers.sites.redirect-rules.reorder'],
  permissions: ['site:manage-redirects'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    rules: z
      .array(z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]))
      .min(1)
      .describe('Redirect rule IDs in evaluation order, e.g. [12, 9, 15].'),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal }) {
    await client.put(`${redirectRulesPath(organization(args.organization), args.server, args.site)}/reorder`, {
      body: { redirects: args.rules.map(Number) },
      signal,
    });
    // The rule resources carry no position: the export (in evaluation order) shows the result.
    return queued('reorder the redirect rules', 'forge_export_redirect_rules');
  },
});
