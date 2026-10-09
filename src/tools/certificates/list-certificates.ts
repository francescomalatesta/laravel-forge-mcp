import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from '../shared/site-scope.js';
import { domainInput } from '../domains/shared.js';
import { certificateOutput, formatCertificate } from './shared.js';

export const listCertificates = defineTool({
  name: 'forge_list_certificates',
  title: 'List certificates',
  description:
    'List the SSL certificates of a site across all its domains, or of one domain with `domain`. Shows type, status and which certificate is active.',
  toolset: 'sites',
  operations: ['organizations.servers.sites.certificates.index', 'organizations.servers.sites.domains.certificates.index'],
  permissions: ['site:meta'],
  readOnly: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    domain: domainInput.optional().describe('Only list the certificates of this domain.'),
  },
  outputSchema: {
    certificates: z.array(certificateOutput),
  },
  async handler(args, { client, organization, signal }) {
    const base = sitePath(organization(args.organization), args.server, args.site);
    const path = args.domain === undefined ? `${base}/certificates` : `${base}/domains/${encodeURIComponent(String(args.domain))}/certificates`;
    const response = await client.get<CollectionDocument>(path, { signal });
    const certificates = flattenCollection(response.data).items.map(formatCertificate);
    const active = certificates.filter((certificate) => certificate.active).length;
    return {
      structured: { certificates },
      summary:
        certificates.length === 0
          ? 'No certificates found: secure the domain with forge_create_certificate.'
          : `Found ${certificates.length} certificate(s), ${active} active.`,
    };
  },
});
