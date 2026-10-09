import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { installationPhase, operationOutput, outcome, waitFor, waitInput } from '../shared/async.js';
import { findNew, listRecent } from '../shared/read.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { formatSshKey, sshKeyOutput, sshKeysPath } from './shared.js';

const CHECK_WITH = 'forge_list_ssh_keys';

export const addSshKey = defineTool({
  name: 'forge_add_ssh_key',
  title: 'Add SSH key',
  description:
    "Authorize a public SSH key to log in to a server (added to the user's authorized_keys). Waits until it is installed unless `wait` is false.",
  toolset: 'security',
  operations: ['organizations.servers.ssh-keys.store', 'organizations.servers.ssh-keys.index'],
  permissions: ['server:create-keys', 'server:view'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    name: z.string().min(1).describe('Name of the key, e.g. "Jane laptop".'),
    key: z
      .string()
      .trim()
      .regex(/^(ssh-|ecdsa-|sk-)/, 'Pass the public key (it starts with ssh-ed25519, ssh-rsa, ecdsa-…), never a private key.')
      .describe('Public key, e.g. "ssh-ed25519 AAAA… jane@laptop".'),
    user: z.string().min(1).optional().describe('Server user the key logs in as (default: forge).'),
    ...waitInput(60),
  },
  outputSchema: {
    ...operationOutput,
    ssh_key: sshKeyOutput.nullable().describe('The new key once it shows up.'),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const base = sshKeysPath(organization(args.organization), args.server);
    // Forge returns no body: remember the existing keys with this name to spot the new one.
    const lookup = () => listRecent(client, base, signal, { sortable: false, filter: { name: args.name } });
    const existing = args.wait ? new Set((await lookup()).map((key) => key.id)) : undefined;
    await client.post(base, { body: { name: args.name, key: args.key, user: args.user }, signal });
    const action = `add the SSH key ${args.name}`;
    if (!existing) {
      return {
        structured: { status: 'queued' as const, check_with: CHECK_WITH, ssh_key: null },
        summary: `Forge accepted the request to ${action}; it runs in the background. Check it with ${CHECK_WITH}.`,
      };
    }

    const result = await waitFor({
      poll: async () => findNew(await lookup(), existing),
      phase: (key) => (key ? installationPhase(key.status) : 'pending'),
      describe: (key) => (key ? `SSH key is ${key.status}` : 'Waiting for the key to appear'),
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const sshKey = result.value ? formatSshKey(result.value) : null;
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds, detail: sshKey ? `Key ID: ${sshKey.id}.` : undefined });
    return { structured: { ...done.structured, ssh_key: sshKey }, summary: done.summary };
  },
});
