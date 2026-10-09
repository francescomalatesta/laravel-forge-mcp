import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput } from '../shared/site-scope.js';
import { describeIntegration, integrationOperation, integrationOutput, integrationPath, readIntegration, type IntegrationName } from './shared.js';

const CHECK_WITH = 'forge_get_site_integrations';

/** Inertia SSR has no disable endpoint in the API. */
const DISABLEABLE = ['horizon', 'octane', 'reverb', 'pulse', 'scheduler', 'maintenance'] as const satisfies readonly IntegrationName[];

export const disableSiteIntegration = defineTool({
  name: 'forge_disable_site_integration',
  title: 'Disable site integration',
  description:
    'Disable a Laravel integration on a site: horizon, octane, reverb or pulse (removes their daemon: queues or servers stop), scheduler (removes the scheduled job) or maintenance (brings the site back up). Inertia SSR cannot be disabled through the API. Waits until it is disabled unless `wait` is false.',
  toolset: 'integrations',
  operations: [...DISABLEABLE.map((name) => integrationOperation(name, 'destroy')), ...DISABLEABLE.map((name) => integrationOperation(name, 'show'))],
  permissions: ['server:delete-daemons', 'server:delete-schedulers', 'site:manage-commands', 'server:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    integration: z.enum(DISABLEABLE).describe('Integration to disable.'),
    ...waitInput(90),
  },
  outputSchema: {
    ...operationOutput,
    integration: integrationOutput.nullable().describe('State after the wait.'),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = integrationPath(organization(args.organization), args.server, args.site, args.integration);
    await client.delete(path, { signal });
    const action = `disable ${args.integration}`;
    if (!args.wait) {
      const accepted = queued(action, CHECK_WITH);
      return { ...accepted, structured: { ...accepted.structured, integration: null } };
    }

    const result = await waitFor({
      poll: () => readIntegration(client, path, args.integration, signal),
      phase: (state) => (state.enabled === false && state.status !== 'disabling' ? 'completed' : 'pending'),
      describe: describeIntegration,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
    return { structured: { ...done.structured, integration: result.value ?? null }, summary: done.summary };
  },
});
