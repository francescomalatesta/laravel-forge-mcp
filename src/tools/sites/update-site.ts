import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from '../shared/site-scope.js';
import { PHP_VERSIONS, SITE_TYPES, readSite } from './shared.js';

const CHECK_WITH = 'forge_get_site';

type Check = { field: string; matches: (site: Record<string, unknown>) => boolean };

export const updateSite = defineTool({
  name: 'forge_update_site',
  title: 'Update site',
  description:
    "Change a site's settings: PHP version, application type, web or root directory, deployed branch, push to deploy and zero-downtime release retention. Only the given fields change. To switch repository or provider use forge_update_site_repository.",
  toolset: 'sites',
  operations: ['organizations.servers.sites.update', 'organizations.sites.show'],
  permissions: ['site:create', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    php_version: z.enum(PHP_VERSIONS).optional(),
    type: z.enum(SITE_TYPES).optional().describe('Application type.'),
    directory: z.string().min(1).optional().describe('Web (public) directory, e.g. "/public".'),
    root_path: z.string().min(1).optional().describe('Project root directory.'),
    repository_branch: z.string().min(1).optional().describe('Branch to deploy.'),
    push_to_deploy: z.boolean().optional().describe('Deploy automatically on every push to the branch.'),
    deployment_retention: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Zero-downtime releases to keep on the server.'),
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const org = organization(args.organization);
    const { organization: _org, server, site, wait, timeout_seconds, ...body } = args;
    if (Object.values(body).every((value) => value === undefined)) {
      throw new ToolInputError('Nothing to update: pass at least one setting to change.');
    }
    await client.put(sitePath(org, server, site), { body, signal });

    // Settings that the site resource reflects; PHP version and type are applied but not exposed reliably.
    const checks: Check[] = [];
    if (body.directory !== undefined) checks.push({ field: 'web_directory', matches: (s) => s.web_directory === body.directory });
    if (body.root_path !== undefined) checks.push({ field: 'root_directory', matches: (s) => s.root_directory === body.root_path });
    if (body.repository_branch !== undefined) {
      checks.push({ field: 'branch', matches: (s) => (s.repository as { branch?: string } | undefined)?.branch === body.repository_branch });
    }
    if (body.push_to_deploy !== undefined) checks.push({ field: 'quick_deploy', matches: (s) => s.quick_deploy === body.push_to_deploy });
    if (body.deployment_retention !== undefined) {
      checks.push({ field: 'deployment_retention', matches: (s) => s.deployment_retention === body.deployment_retention });
    }

    const action = 'update the site settings';
    if (!wait) return queued(action, CHECK_WITH);
    if (checks.length === 0) {
      return queued(action, CHECK_WITH, '(the site resource does not report PHP version and type changes)');
    }

    const result = await waitFor({
      poll: () => readSite(client, org, site, signal),
      phase: (current) => (checks.every((check) => check.matches(current)) ? 'completed' : 'pending'),
      describe: (current) => `Waiting for ${checks.filter((check) => !check.matches(current)).map((c) => c.field).join(', ')}`,
      timeoutSeconds: timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: timeout_seconds });
  },
});
