import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { domainPath, domainScopeInput } from '../domains/shared.js';
import { CERTIFICATE_NOT_FOUND_HINT, certificateInput, certificatePhase, readCertificate } from './shared.js';

const CHECK_WITH = 'forge_get_certificate';

export const runCertificateAction = defineTool({
  name: 'forge_run_certificate_action',
  title: 'Activate or deactivate a certificate',
  description: 'Activate ("enable") a certificate so the domain serves it, or deactivate it ("disable").',
  toolset: 'sites',
  operations: [
    'organizations.servers.sites.domains.certificates.actions.store',
    'organizations.servers.sites.domains.certificates.show',
  ],
  permissions: ['site:meta'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: CERTIFICATE_NOT_FOUND_HINT,
  inputSchema: {
    ...domainScopeInput,
    certificate: certificateInput,
    action: z.enum(['enable', 'disable']),
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = `${domainPath(organization(args.organization), args.server, args.site, args.domain)}/certificates/${encodeURIComponent(String(args.certificate))}`;
    await client.post(`${path}/actions`, { body: { action: args.action }, signal });
    const action = `${args.action} certificate ${args.certificate}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const wanted = args.action === 'enable';
    const result = await waitFor({
      poll: () => readCertificate(client, path, signal),
      phase: (certificate) => (certificate.active === wanted ? certificatePhase(certificate) : 'pending'),
      describe: (certificate) => `Certificate ${certificate.id} is ${certificate.status}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
