import { apiPath } from '../../forge/path.js';
import { organizationInput, serverInput, siteInput } from './schemas.js';

/** Arguments identifying a site: site endpoints are nested under the server. */
export const siteScopeInput = {
  organization: organizationInput,
  server: serverInput,
  site: siteInput,
};

export function sitePath(org: string, server: string | number, site: string | number): string {
  return apiPath`/orgs/${org}/servers/${server}/sites/${site}`;
}

export const SITE_NOT_FOUND_HINT =
  'Check the server and site IDs with forge_list_sites (each site lists its `server_id`).';
