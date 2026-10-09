import { z } from 'zod';
import { idInput, pick } from '../shared/schemas.js';
import { serverPath } from '../servers/shared.js';

export function firewallRulesPath(org: string, server: string | number): string {
  return `${serverPath(org, server)}/firewall-rules`;
}

export const firewallRuleInput = idInput('Firewall rule ID. Use forge_list_firewall_rules to find it.');

export const FIREWALL_RULE_NOT_FOUND_HINT = 'Check the firewall rule ID with forge_list_firewall_rules.';

const FIELDS = ['id', 'name', 'type', 'port', 'ip_address', 'status', 'created_at', 'updated_at'] as const;

export const firewallRuleOutput = z.looseObject({
  id: z.string(),
  name: z.string().nullable(),
  type: z.string().nullable().describe('allow or deny.'),
  port: z.string().nullable().describe('Port or range, e.g. "80" or "8000:8010"; null for every port.'),
  ip_address: z.string().nullable().describe('IP address or subnet; null for any address.'),
  status: z.string().nullable().describe('e.g. installing, installed, removing.'),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type FirewallRuleOutput = z.output<typeof firewallRuleOutput>;

export function formatFirewallRule(flat: Record<string, unknown>): FirewallRuleOutput {
  return pick(flat, FIELDS) as FirewallRuleOutput;
}
