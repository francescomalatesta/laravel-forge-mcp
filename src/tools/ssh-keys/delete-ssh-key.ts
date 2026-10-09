import { defineTool } from '../define-tool.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { sshKeyInput, sshKeysPath } from './shared.js';

const CHECK_WITH = 'forge_list_ssh_keys';

export const deleteSshKey = defineTool({
  name: 'forge_delete_ssh_key',
  title: 'Delete SSH key',
  description: 'Revoke an SSH key: it can no longer log in to the server.',
  toolset: 'security',
  operations: ['organizations.servers.ssh-keys.destroy', 'organizations.servers.ssh-keys.show'],
  permissions: ['server:delete-keys', 'server:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: 'Check the key ID with forge_list_ssh_keys.',
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    key: sshKeyInput,
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = `${sshKeysPath(organization(args.organization), args.server)}/${encodeURIComponent(String(args.key))}`;
    await client.delete(path, { signal });
    const action = `delete SSH key ${args.key}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => orGone(() => readResource(client, path, signal)),
      phase: (key) => (key === null ? 'completed' : 'pending'),
      describe: (key) => `SSH key is ${key?.status ?? 'removing'}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
