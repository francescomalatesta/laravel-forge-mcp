import { defineTool } from '../define-tool.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { domainPath, domainScopeInput } from '../domains/shared.js';
import { CERTIFICATE_NOT_FOUND_HINT, certificateInput, readCertificate } from './shared.js';

const CHECK_WITH = 'forge_list_certificates';

export const deleteCertificate = defineTool({
  name: 'forge_delete_certificate',
  title: 'Delete certificate',
  description: 'Delete a certificate from a domain. If it is the active one, the domain is no longer served over HTTPS.',
  toolset: 'sites',
  operations: [
    'organizations.servers.sites.domains.certificates.destroy',
    'organizations.servers.sites.domains.certificates.show',
  ],
  permissions: ['site:manage-ssl', 'site:meta'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: CERTIFICATE_NOT_FOUND_HINT,
  inputSchema: {
    ...domainScopeInput,
    certificate: certificateInput,
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = `${domainPath(organization(args.organization), args.server, args.site, args.domain)}/certificates/${encodeURIComponent(String(args.certificate))}`;
    await client.delete(path, { signal });
    const action = `delete certificate ${args.certificate}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => orGone(() => readCertificate(client, path, signal)),
      phase: (certificate) => (certificate === null ? 'completed' : 'pending'),
      describe: (certificate) => `Certificate is ${certificate?.status ?? 'deleting'}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
