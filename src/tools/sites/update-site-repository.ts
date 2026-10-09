import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, phaseOf, waitFor, waitInput } from '../shared/async.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from '../shared/site-scope.js';
import { formatSite, siteOutput } from './format.js';
import { SOURCE_CONTROL_PROVIDERS, readSite } from './shared.js';

const CHECK_WITH = 'forge_get_site';

export const updateSiteRepository = defineTool({
  name: 'forge_update_site_repository',
  title: 'Update site repository',
  description:
    'Change the source control provider, repository or branch a site deploys from. Waits until Forge installs the repository unless `wait` is false; deploy afterwards with forge_deploy_site.',
  toolset: 'sites',
  operations: ['organizations.servers.sites.git.update', 'organizations.sites.show'],
  permissions: ['site:manage-project', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    source_control_provider: z.enum(SOURCE_CONTROL_PROVIDERS),
    source_control_provider_id: z
      .number()
      .int()
      .optional()
      .describe('Source control connection to deploy through, when the organization has several.'),
    repository: z.string().min(1).describe('Repository, e.g. "acme/app" (or an SSH URL for custom Git).'),
    branch: z.string().min(1).describe('Branch to deploy.'),
    per_account_public_key: z.string().min(1).optional().describe('Existing deploy public key to pin to the site.'),
    per_account_private_key: z.string().min(1).optional().describe('Private key matching per_account_public_key.'),
    ...waitInput(120),
  },
  outputSchema: {
    ...operationOutput,
    site: siteOutput.nullable(),
  },
  async handler(args, { client, config, organization, signal, sleep, progress }) {
    const org = organization(args.organization);
    const { organization: _org, server, site, wait, timeout_seconds, ...body } = args;
    const response = await client.put<SingleDocument | undefined>(`${sitePath(org, server, site)}/git`, { body, signal });
    const initial = response.data?.data ? flattenSingle(response.data) : undefined;
    const format = (flat: Record<string, unknown>) =>
      formatSite(flat, { detailed: false, allowSecrets: config.allowSecrets, serverId: String(server) });
    const action = `switch the site to ${args.repository}@${args.branch}`;

    if (!wait) {
      return {
        structured: { status: 'queued' as const, check_with: CHECK_WITH, site: initial ? format(initial) : null },
        summary: `Forge accepted the request to ${action}. Follow it with ${CHECK_WITH}.`,
      };
    }

    const result = await waitFor({
      ...(initial ? { initial } : {}),
      poll: () => readSite(client, org, site, signal),
      phase: (current) => {
        const repository = (current.repository ?? {}) as { branch?: string | null; status?: string | null };
        const phase = phaseOf(repository.status, { pending: ['installing', 'removing'] });
        return phase === 'completed' && repository.branch !== args.branch ? 'pending' : phase;
      },
      describe: (current) => `Repository is ${(current.repository as { status?: string } | undefined)?.status ?? 'updating'}`,
      timeoutSeconds: timeout_seconds,
      context: { sleep, progress },
    });
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: timeout_seconds });
    const latest = result.value ?? initial;
    return { structured: { ...done.structured, site: latest ? format(latest) : null }, summary: done.summary };
  },
});
