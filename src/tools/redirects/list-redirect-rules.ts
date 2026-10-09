import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { paginationInput, paginationOutput, paginationSummary } from '../shared/schemas.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput } from '../shared/site-scope.js';
import { formatRedirectRule, REDIRECT_TYPES, redirectRuleInput, redirectRuleOutput, redirectRulesPath } from './shared.js';

const SORT = ['created_at', '-created_at', 'updated_at', '-updated_at'] as const;

export const listRedirectRules = defineTool({
  name: 'forge_list_redirect_rules',
  title: 'List redirect rules',
  description:
    'List the redirect rules of a site (from → to, 301 or 302), or get one with `rule`. Use forge_export_redirect_rules to see them in evaluation order.',
  toolset: 'security',
  operations: ['organizations.servers.sites.redirect-rules.index', 'organizations.servers.sites.redirect-rules.show'],
  permissions: ['site:manage-redirects'],
  readOnly: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    rule: redirectRuleInput.optional().describe('Return only this rule.'),
    from: z.string().min(1).optional().describe('Filter by source path.'),
    to: z.string().min(1).optional().describe('Filter by destination.'),
    type: z.enum(REDIRECT_TYPES).optional().describe('Filter by type.'),
    status: z.enum(['installing', 'installed', 'removing']).optional().describe('Filter by status.'),
    sort: z.array(z.enum(SORT)).min(1).optional(),
    ...paginationInput,
  },
  outputSchema: {
    rules: z.array(redirectRuleOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const base = redirectRulesPath(organization(args.organization), args.server, args.site);
    if (args.rule !== undefined) {
      const rule = formatRedirectRule(await readResource(client, `${base}/${encodeURIComponent(String(args.rule))}`, signal));
      return { structured: { rules: [rule], next_cursor: null, has_more: false }, summary: `${rule.from} → ${rule.to} (${rule.type}) is ${rule.status}.` };
    }
    const response = await client.get<CollectionDocument>(base, {
      query: {
        filter: { from: args.from, to: args.to, type: args.type, status: args.status },
        sort: args.sort,
        page: { size: args.page_size, cursor: args.cursor },
      },
      signal,
    });
    const page = flattenCollection(response.data);
    const rules = page.items.map(formatRedirectRule);
    return {
      structured: { rules, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary: rules.length === 0 ? 'No redirect rules found.' : `Found ${rules.length} redirect rule(s).${paginationSummary(page.nextCursor)}`,
    };
  },
});
