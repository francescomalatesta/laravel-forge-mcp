import { z } from 'zod';
import { ForgeApiError } from '../../forge/errors.js';
import { defineTool } from '../define-tool.js';
import { DOMAIN_NOT_FOUND_HINT, domainPath, domainScopeInput } from '../domains/shared.js';
import { certificateInput, certificateOutput, formatCertificate, readCertificate } from './shared.js';

export const getCertificate = defineTool({
  name: 'forge_get_certificate',
  title: 'Get certificate',
  description:
    'Get a certificate of a domain, or the active one (the certificate currently served) when `certificate` is omitted.',
  toolset: 'sites',
  operations: [
    'organizations.servers.sites.domains.certificates.show',
    'organizations.servers.sites.domains.certificates.active',
  ],
  permissions: ['site:meta'],
  readOnly: true,
  notFoundHint: DOMAIN_NOT_FOUND_HINT,
  inputSchema: {
    ...domainScopeInput,
    certificate: certificateInput.optional().describe('Certificate ID; omit to get the active certificate.'),
  },
  outputSchema: {
    certificate: certificateOutput.nullable().describe('The certificate, or null when the domain has no active certificate.'),
  },
  async handler(args, { client, organization, signal }) {
    const base = `${domainPath(organization(args.organization), args.server, args.site, args.domain)}/certificates`;
    if (args.certificate !== undefined) {
      const certificate = formatCertificate(await readCertificate(client, `${base}/${encodeURIComponent(String(args.certificate))}`, signal));
      return { structured: { certificate }, summary: `Certificate ${certificate.id} (${certificate.type}) is ${certificate.status}.` };
    }

    try {
      const certificate = formatCertificate(await readCertificate(client, `${base}/active`, signal));
      return { structured: { certificate }, summary: `The active certificate is ${certificate.id} (${certificate.type}), ${certificate.status}.` };
    } catch (error) {
      if (error instanceof ForgeApiError && error.status === 404) {
        return {
          structured: { certificate: null },
          summary: 'The domain has no active certificate (or the domain does not exist). Secure it with forge_create_certificate.',
        };
      }
      throw error;
    }
  },
});
