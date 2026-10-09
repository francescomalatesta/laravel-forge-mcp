import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { operationOutput, outcome, waitFor, waitInput } from '../shared/async.js';
import { DOMAIN_NOT_FOUND_HINT, domainPath, domainScopeInput } from '../domains/shared.js';
import { certificateOutput, certificatePhase, formatCertificate, readCertificate } from './shared.js';

const CHECK_WITH = 'forge_get_certificate';

export const createCertificate = defineTool({
  name: 'forge_create_certificate',
  title: 'Create certificate',
  description: [
    'Secure a domain with an SSL certificate. Types:',
    '"letsencrypt" (free, issued and renewed automatically; the domain DNS must already point to the server, or use dns-01 verification);',
    '"existing" (install your own `certificate` chain and `private_key`);',
    '"csr" (generate a signing request to send to a certificate authority);',
    '"clone" (copy certificate `clone_certificate_id` from another domain).',
    'Waits until the certificate is issued and installed unless `wait` is false.',
  ].join(' '),
  toolset: 'sites',
  operations: ['organizations.servers.sites.domains.certificates.store', 'organizations.servers.sites.domains.certificates.show'],
  permissions: ['site:manage-ssl', 'site:meta'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  notFoundHint: DOMAIN_NOT_FOUND_HINT,
  inputSchema: {
    ...domainScopeInput,
    type: z.enum(['letsencrypt', 'existing', 'csr', 'clone']).default('letsencrypt'),
    enable: z.boolean().optional().describe('Activate the certificate once installed (existing and clone only; Let\'s Encrypt activates automatically).'),
    verification_method: z.enum(['http-01', 'dns-01']).optional().describe('Let\'s Encrypt: domain verification method.'),
    key_type: z.enum(['ecdsa', 'rsa']).optional().describe('Let\'s Encrypt: key type.'),
    preferred_chain: z.enum(['ISRG Root X1']).optional().describe('Let\'s Encrypt: preferred chain.'),
    certificate: z.string().min(1).optional().describe('Existing: the certificate chain (PEM).'),
    private_key: z.string().min(1).optional().describe('Existing: the private key (PEM).'),
    csr_domain: z.string().min(1).optional().describe('CSR: domain to generate the request for.'),
    csr_sans: z.string().min(1).optional().describe('CSR: additional domains, comma-separated.'),
    csr_country: z.string().min(1).optional(),
    csr_state: z.string().min(1).optional(),
    csr_city: z.string().min(1).optional(),
    csr_organization: z.string().min(1).optional(),
    csr_department: z.string().min(1).optional(),
    clone_certificate_id: z.number().int().optional().describe('Clone: ID of the certificate to copy.'),
    ...waitInput(180),
  },
  outputSchema: {
    ...operationOutput,
    certificate: certificateOutput.nullable(),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const body = buildBody(args);
    const base = `${domainPath(organization(args.organization), args.server, args.site, args.domain)}/certificates`;
    const response = await client.post<SingleDocument | undefined>(base, { body, signal });
    const initial = response.data?.data ? flattenSingle(response.data) : undefined;
    const action = `create the ${args.type} certificate`;

    if (!initial || !args.wait) {
      return {
        structured: { status: 'queued' as const, check_with: initial ? CHECK_WITH : 'forge_list_certificates', certificate: initial ? formatCertificate(initial) : null },
        summary: `Forge accepted the request to ${action}. Follow it with ${initial ? `${CHECK_WITH} (certificate ${initial.id})` : 'forge_list_certificates'}.`,
      };
    }

    const result = await waitFor({
      initial,
      poll: () => readCertificate(client, `${base}/${encodeURIComponent(initial.id)}`, signal),
      phase: certificatePhase,
      describe: (certificate) => `Certificate ${certificate.id}: request ${certificate.request_status}, ${certificate.status}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const done = outcome(result, {
      action,
      checkWith: CHECK_WITH,
      timeoutSeconds: args.timeout_seconds,
      detail:
        result.status === 'failed' && args.type === 'letsencrypt'
          ? "Let's Encrypt usually fails when the domain DNS does not point to the server: check it with forge_get_domain, and the error with forge_list_server_events."
          : undefined,
    });
    return { structured: { ...done.structured, certificate: formatCertificate(result.value ?? initial) }, summary: done.summary };
  },
});

type Args = Record<string, unknown> & { type: 'letsencrypt' | 'existing' | 'csr' | 'clone' };

/** Maps the flat tool arguments to the nested request body of the chosen certificate type. */
function buildBody(args: Args): Record<string, unknown> {
  const pickDefined = (entries: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined));

  switch (args.type) {
    case 'letsencrypt':
      return {
        type: 'letsencrypt',
        letsencrypt: pickDefined({ verification_method: args.verification_method, key_type: args.key_type, preferred_chain: args.preferred_chain }),
      };
    case 'existing':
      if (!args.certificate || !args.private_key) {
        throw new ToolInputError('An "existing" certificate needs both `certificate` and `private_key`.');
      }
      return pickDefined({ type: 'existing', enable: args.enable, existing: { certificate: args.certificate, key: args.private_key } });
    case 'csr':
      if (!args.csr_domain) throw new ToolInputError('A "csr" certificate needs `csr_domain`.');
      return {
        type: 'csr',
        csr: pickDefined({
          domain: args.csr_domain,
          sans: args.csr_sans,
          country: args.csr_country,
          state: args.csr_state,
          city: args.csr_city,
          organization: args.csr_organization,
          department: args.csr_department,
        }),
      };
    case 'clone':
      if (args.clone_certificate_id === undefined) throw new ToolInputError('A "clone" certificate needs `clone_certificate_id`.');
      return pickDefined({ type: 'clone', enable: args.enable, clone: { certificate_id: args.clone_certificate_id } });
  }
}
