import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput } from '../shared/site-scope.js';
import { redirectRulesPath } from './shared.js';

export const exportRedirectRules = defineTool({
  name: 'forge_export_redirect_rules',
  title: 'Export redirect rules',
  description:
    'Export every redirect rule of a site as CSV (from,to,type header) in evaluation order: use it to review the order, back them up or copy them to another site with forge_import_redirect_rules.',
  toolset: 'security',
  operations: ['organizations.servers.sites.redirect-rules.export'],
  permissions: ['site:manage-redirects'],
  readOnly: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
  },
  outputSchema: {
    csv: z.string().describe('CSV with a from,to,type header row.'),
    rules: z.number().int().describe('Number of rules (rows after the header).'),
  },
  async handler(args, { client, organization, signal }) {
    const response = await client.get<unknown>(`${redirectRulesPath(organization(args.organization), args.server, args.site)}/export`, {
      accept: 'text/csv',
      signal,
    });
    const csv = typeof response.data === 'string' ? response.data : '';
    const rules = Math.max(0, csv.split('\n').filter((line) => line.trim() !== '').length - 1);
    return { structured: { csv, rules }, summary: `Exported ${rules} redirect rule(s).` };
  },
});
