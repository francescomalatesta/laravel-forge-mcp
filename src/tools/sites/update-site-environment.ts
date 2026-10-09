import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitInput } from '../shared/async.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from '../shared/site-scope.js';
import { environmentUpdateOptions, writeEnvironment } from './environment.js';

const CHECK_WITH = 'forge_get_site_environment';

export const updateSiteEnvironment = defineTool({
  name: 'forge_update_site_environment',
  title: 'Replace site .env',
  description:
    "Replace the whole .env file of a site. Read it first with forge_get_site_environment and send the complete new content: anything omitted is lost. To change only some variables prefer forge_set_site_env_vars.",
  toolset: 'sites',
  operations: ['organizations.servers.sites.environment.update', 'organizations.servers.sites.environment.show'],
  permissions: ['site:manage-environment', 'server:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  // Only usable safely after reading the full (secret) file, so it shares its opt-in.
  exposesSecrets: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    content: z.string().describe('The complete new .env content.'),
    ...environmentUpdateOptions,
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const base = sitePath(organization(args.organization), args.server, args.site);
    const result = await writeEnvironment(
      client,
      base,
      args.content,
      { cache: args.cache, queues: args.queues, wait: args.wait, timeoutSeconds: args.timeout_seconds },
      { signal, sleep, progress },
    );
    const action = 'replace the .env file';
    return result ? outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds }) : queued(action, CHECK_WITH);
  },
});
