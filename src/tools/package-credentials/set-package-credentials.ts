import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { SITE_NOT_FOUND_HINT, siteScopeInput } from '../shared/site-scope.js';
import { credentialKeyInput, credentialOperations, credentialPath, credentialsPath, managerInput } from './shared.js';

const CHECK_WITH = 'forge_list_package_credentials';

export const setPackageCredentials = defineTool({
  name: 'forge_set_package_credentials',
  title: 'Set package credentials',
  description:
    'Add or replace the credentials a site uses for a private Composer repository (`username` + `password`, e.g. Laravel Nova or Spark) or npm registry (`token`, optional `scopes`). Secrets are never returned.',
  toolset: 'sites',
  operations: [...credentialOperations('store'), ...credentialOperations('update'), ...credentialOperations('show')],
  permissions: ['server:manage-packages', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: SITE_NOT_FOUND_HINT,
  inputSchema: {
    ...siteScopeInput,
    manager: managerInput,
    repository: credentialKeyInput,
    username: z.string().min(1).optional().describe('Composer only.'),
    password: z.string().min(1).optional().describe('Composer only (never returned).'),
    token: z.string().min(1).optional().describe('npm only (never returned).'),
    scopes: z.array(z.string().min(1)).optional().describe('npm only: scopes served by the registry, e.g. ["@acme"].'),
    ...waitInput(60),
  },
  outputSchema: {
    ...operationOutput,
    created: z.boolean().describe('Whether the credentials were added (false: replaced).'),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const composer = args.manager === 'composer';
    if (composer && (!args.username || !args.password || args.token || args.scopes)) {
      throw new ToolInputError('Composer credentials need `username` and `password` (no `token` or `scopes`).');
    }
    if (!composer && (!args.token || args.username || args.password)) {
      throw new ToolInputError('npm credentials need `token` and optionally `scopes` (no `username` or `password`).');
    }
    const org = organization(args.organization);
    const path = credentialPath(org, args.server, args.site, args.manager, args.repository);
    const body = composer
      ? { repository: args.repository, username: args.username, password: args.password }
      : { registry: args.repository, token: args.token, scopes: args.scopes };

    const exists = (await orGone(() => readResource(client, path, signal))) !== null;
    if (exists) await client.put(path, { body, signal });
    else await client.post(credentialsPath(org, args.server, args.site, args.manager), { body, signal });

    const action = `${exists ? 'replace' : 'add'} the ${args.manager} credentials for ${args.repository}`;
    if (!args.wait) {
      const accepted = queued(action, CHECK_WITH);
      return { ...accepted, structured: { ...accepted.structured, created: !exists } };
    }
    // Compared here without ever returning the secret.
    const matches = (current: Record<string, unknown> | null) =>
      current !== null &&
      (composer
        ? current.username === args.username && current.password === args.password
        : current.token === args.token && (args.scopes === undefined || JSON.stringify(current.scopes ?? []) === JSON.stringify(args.scopes)));
    const result = await waitFor({
      poll: () => orGone(() => readResource(client, path, signal)),
      phase: (current) => (matches(current) ? 'completed' : 'pending'),
      describe: () => `Waiting for the ${args.manager} credentials to be saved`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
    return { structured: { ...done.structured, created: !exists }, summary: done.summary };
  },
});
