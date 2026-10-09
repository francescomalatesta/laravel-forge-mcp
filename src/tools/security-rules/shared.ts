import { z } from 'zod';
import { idInput, pick } from '../shared/schemas.js';
import { sitePath } from '../shared/site-scope.js';

export function securityRulesPath(org: string, server: string | number, site: string | number): string {
  return `${sitePath(org, server, site)}/security-rules`;
}

export const securityRuleInput = idInput('Security rule ID. Use forge_list_security_rules to find it.');

export const SECURITY_RULE_NOT_FOUND_HINT = 'Check the security rule ID with forge_list_security_rules.';

export const credentialsInput = z
  .array(
    z.object({
      username: z.string().min(1).max(50),
      password: z.string().min(1).describe('Never returned by any tool.'),
    }),
  )
  .min(1)
  .describe('Users allowed through the password prompt.');

const FIELDS = ['id', 'name', 'path', 'status', 'created_at', 'updated_at'] as const;

export const securityRuleOutput = z.looseObject({
  id: z.string(),
  name: z.string().nullable(),
  path: z.string().nullable().describe('Protected path; null protects the whole site.'),
  status: z.string().nullable().describe('e.g. installing, installed, removing.'),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type SecurityRuleOutput = z.output<typeof securityRuleOutput>;

export function formatSecurityRule(flat: Record<string, unknown>): SecurityRuleOutput {
  return pick(flat, FIELDS) as SecurityRuleOutput;
}
