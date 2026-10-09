import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { paginationInput, paginationOutput, paginationSummary } from '../shared/schemas.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput } from '../shared/site-scope.js';
import { formatSecurityRule, securityRuleInput, securityRuleOutput, securityRulesPath } from './shared.js';

const SORT = ['path', '-path', 'status', '-status', 'created_at', '-created_at', 'updated_at', '-updated_at'] as const;

export const listSecurityRules = defineTool({
  name: 'forge_list_security_rules',
  title: 'List security rules',
  description: 'List the password-protected (HTTP basic auth) paths of a site, or get one with `rule`. Credentials are never returned.',
  toolset: 'security',
  operations: ['organizations.servers.sites.security-rules.index', 'organizations.servers.sites.security-rules.show'],
  permissions: ['site:manage-security'],
  readOnly: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    rule: securityRuleInput.optional().describe('Return only this rule.'),
    path: z.string().min(1).optional().describe('Filter by path.'),
    status: z.string().min(1).optional().describe('Filter by status, e.g. "installed".'),
    sort: z.array(z.enum(SORT)).min(1).optional(),
    ...paginationInput,
  },
  outputSchema: {
    rules: z.array(securityRuleOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const base = securityRulesPath(organization(args.organization), args.server, args.site);
    if (args.rule !== undefined) {
      const rule = formatSecurityRule(await readResource(client, `${base}/${encodeURIComponent(String(args.rule))}`, signal));
      return { structured: { rules: [rule], next_cursor: null, has_more: false }, summary: `Security rule ${rule.name} is ${rule.status}.` };
    }
    const response = await client.get<CollectionDocument>(base, {
      query: { filter: { path: args.path, status: args.status }, sort: args.sort, page: { size: args.page_size, cursor: args.cursor } },
      signal,
    });
    const page = flattenCollection(response.data);
    const rules = page.items.map(formatSecurityRule);
    return {
      structured: { rules, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        rules.length === 0
          ? 'No security rules: no path of this site is password protected.'
          : `Found ${rules.length} security rule(s): ${rules.map((r) => `${r.path ?? 'whole site'} (${r.id})`).join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
