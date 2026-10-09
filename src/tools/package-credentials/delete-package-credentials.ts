import { defineTool } from '../define-tool.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { siteScopeInput } from '../shared/site-scope.js';
import { credentialKeyInput, credentialOperations, credentialPath, managerInput } from './shared.js';

const CHECK_WITH = 'forge_list_package_credentials';

export const deletePackageCredentials = defineTool({
  name: 'forge_delete_package_credentials',
  title: 'Delete package credentials',
  description: 'Remove the credentials of a private Composer repository or npm registry: installing its packages will fail.',
  toolset: 'sites',
  operations: [...credentialOperations('destroy'), ...credentialOperations('show')],
  permissions: ['server:manage-packages', 'server:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: 'Check the repository with forge_list_package_credentials.',
  inputSchema: {
    ...siteScopeInput,
    manager: managerInput,
    repository: credentialKeyInput,
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = credentialPath(organization(args.organization), args.server, args.site, args.manager, args.repository);
    await client.delete(path, { signal });
    const action = `delete the ${args.manager} credentials for ${args.repository}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => orGone(() => readResource(client, path, signal)),
      phase: (credential) => (credential === null ? 'completed' : 'pending'),
      describe: () => 'Waiting for the credentials to be removed',
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
