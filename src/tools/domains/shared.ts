import { z } from 'zod';
import type { ForgeClient } from '../../forge/client.js';
import { flattenSingle, type FlatResource, type SingleDocument } from '../../forge/jsonapi.js';
import { phaseOf, type Phase } from '../shared/async.js';
import { idInput, pick } from '../shared/schemas.js';
import { siteScopeInput, sitePath } from '../shared/site-scope.js';

export const domainInput = idInput('Domain ID. Use forge_list_domains to find it.');

/** Arguments identifying a domain of a site. */
export const domainScopeInput = {
  ...siteScopeInput,
  domain: domainInput,
};

export function domainPath(org: string, server: string | number, site: string | number, domain: string | number): string {
  return `${sitePath(org, server, site)}/domains/${encodeURIComponent(String(domain))}`;
}

export const DOMAIN_NOT_FOUND_HINT = 'Check the domain ID with forge_list_domains.';

export const WWW_REDIRECT_TYPES = ['from-www', 'to-www', 'none'] as const;

const DOMAIN_FIELDS = ['id', 'name', 'type', 'status', 'www_redirect_type', 'allow_wildcard_subdomains', 'created_at'] as const;

export const domainOutput = z.looseObject({
  id: z.string().describe('Domain ID, used as the `domain` argument.'),
  name: z.string().nullable(),
  type: z.string().nullable().describe('primary or alias.'),
  status: z.string().nullable().describe('pending, connecting, enabled, securing, disabled, ...'),
  www_redirect_type: z.string().nullable(),
  allow_wildcard_subdomains: z.boolean().nullable(),
  created_at: z.string().nullable(),
});

export type DomainOutput = z.output<typeof domainOutput>;

export function formatDomain(flat: Record<string, unknown>): DomainOutput {
  return pick(flat, DOMAIN_FIELDS) as DomainOutput;
}

export async function readDomain(client: ForgeClient, path: string, signal: AbortSignal): Promise<FlatResource> {
  const response = await client.get<SingleDocument>(path, { signal });
  return flattenSingle(response.data);
}

/** Domains have no failed status: anything not transitional is settled. */
export function domainPhase(status: unknown): Phase {
  return phaseOf(status, { pending: ['pending', 'connecting', 'removing', 'securing', 'updating', 'disabling', 'enabling'] });
}
