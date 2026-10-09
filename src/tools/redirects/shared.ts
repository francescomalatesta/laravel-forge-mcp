import { z } from 'zod';
import { idInput, pick } from '../shared/schemas.js';
import { sitePath } from '../shared/site-scope.js';

export function redirectRulesPath(org: string, server: string | number, site: string | number): string {
  return `${sitePath(org, server, site)}/redirect-rules`;
}

export const redirectRuleInput = idInput('Redirect rule ID. Use forge_list_redirect_rules to find it.');

export const REDIRECT_TYPES = ['redirect', 'permanent'] as const;

export const redirectTypeInput = z
  .enum(REDIRECT_TYPES)
  .describe('"permanent" (301, cached by browsers and search engines) or "redirect" (302, temporary).');

const FIELDS = ['id', 'from', 'to', 'type', 'status', 'created_at', 'updated_at'] as const;

export const redirectRuleOutput = z.looseObject({
  id: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  type: z.string().nullable().describe('redirect (302) or permanent (301).'),
  status: z.string().nullable().describe('installing, installed or removing.'),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type RedirectRuleOutput = z.output<typeof redirectRuleOutput>;

export function formatRedirectRule(flat: Record<string, unknown>): RedirectRuleOutput {
  return pick(flat, FIELDS) as RedirectRuleOutput;
}
