import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { operationOutput, outcome, queued, waitInput } from '../shared/async.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput, sitePath } from '../shared/site-scope.js';
import { ENV_KEY_PATTERN, patchEnv } from './env-file.js';
import { environmentUpdateOptions, readEnvironment, writeEnvironment } from './environment.js';

// Reading the file back needs FORGE_ALLOW_SECRETS; the tool itself never returns values.
const CHECK_WITH = 'forge_get_site_environment';
const envKey = z.string().regex(ENV_KEY_PATTERN, 'Invalid variable name');

export const setSiteEnvVars = defineTool({
  name: 'forge_set_site_env_vars',
  title: 'Set site environment variables',
  description:
    "Set or remove specific variables in a site's .env file, keeping every other line unchanged. The file content and current values are never returned, so this works without exposing secrets. Values are quoted automatically when needed.",
  toolset: 'sites',
  operations: ['organizations.servers.sites.environment.show', 'organizations.servers.sites.environment.update'],
  permissions: ['server:view', 'site:manage-environment'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    set: z.record(envKey, z.string()).optional().describe('Variables to add or update, e.g. {"APP_DEBUG": "false"}.'),
    unset: z.array(envKey).optional().describe('Variables to remove.'),
    ...environmentUpdateOptions,
    ...waitInput(60),
  },
  outputSchema: {
    ...operationOutput,
    updated: z.array(z.string()).describe('Existing variables that were set.'),
    added: z.array(z.string()).describe('Variables appended to the file.'),
    removed: z.array(z.string()).describe('Variables removed from the file.'),
    not_found: z.array(z.string()).describe('Variables to remove that were not in the file.'),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const set = args.set ?? {};
    const unset = args.unset ?? [];
    if (Object.keys(set).length === 0 && unset.length === 0) {
      throw new ToolInputError('Nothing to change: pass `set` and/or `unset`.');
    }
    const conflicting = unset.filter((key) => Object.hasOwn(set, key));
    if (conflicting.length > 0) throw new ToolInputError(`Variables both set and unset: ${conflicting.join(', ')}.`);

    const base = sitePath(organization(args.organization), args.server, args.site);
    const current = await readEnvironment(client, base, signal);
    const patch = patchEnv(current, { set, unset });
    const notFound = unset.filter((key) => !patch.removed.includes(key));
    const changes = { updated: patch.updated, added: patch.added, removed: patch.removed, not_found: notFound };

    if (patch.updated.length + patch.added.length + patch.removed.length === 0) {
      return {
        structured: { status: 'completed' as const, check_with: CHECK_WITH, ...changes },
        summary: `Nothing to change: ${notFound.join(', ')} not found in the .env file.`,
      };
    }

    const result = await writeEnvironment(
      client,
      base,
      patch.content,
      { cache: args.cache, queues: args.queues, wait: args.wait, timeoutSeconds: args.timeout_seconds },
      { signal, sleep, progress },
    );
    const list = [...patch.updated, ...patch.added].join(', ');
    const action = [list && `set ${list}`, patch.removed.length > 0 && `remove ${patch.removed.join(', ')}`]
      .filter(Boolean)
      .join(' and ');
    const done = result
      ? outcome(result, { action: `${action} in the .env file`, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds })
      : queued(`${action} in the .env file`, CHECK_WITH);
    return { structured: { ...done.structured, ...changes }, summary: done.summary };
  },
});
