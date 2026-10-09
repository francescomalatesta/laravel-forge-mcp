import type { ForgeClient } from '../../forge/client.js';
import { flattenSingle, type FlatResource, type SingleDocument } from '../../forge/jsonapi.js';
import { apiPath } from '../../forge/path.js';
import { phaseOf, type Phase } from '../shared/async.js';

export const SITE_TYPES = [
  'laravel',
  'symfony',
  'statamic',
  'wordpress',
  'phpmyadmin',
  'php',
  'nextjs',
  'nuxtjs',
  'static-html',
  'other',
  'custom',
] as const;

export const PHP_VERSIONS = [
  'php5',
  'php56-old',
  'php56',
  'php70',
  'php71',
  'php72',
  'php73',
  'php74',
  'php80',
  'php81',
  'php82',
  'php83',
  'php84',
  'php85',
] as const;

export const SOURCE_CONTROL_PROVIDERS = ['github', 'gitlab', 'bitbucket', 'gitlab-custom', 'custom'] as const;

/** Reads a site by ID (the organization-level endpoint needs no server). */
export async function readSite(client: ForgeClient, org: string, site: string | number, signal: AbortSignal): Promise<FlatResource> {
  const response = await client.get<SingleDocument>(apiPath`/orgs/${org}/sites/${site}`, { signal });
  return flattenSingle(response.data);
}

/** Site provisioning: transitional statuses from the SiteResource enum. */
export function sitePhase(status: unknown): Phase {
  return phaseOf(status, { pending: ['creating', 'installing', 'removing', 'uninstalling'], failed: ['failed'] });
}
