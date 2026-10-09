import { defineTool } from '../define-tool.js';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { organizationInput, pick, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT, serverPath } from '../servers/shared.js';
import { serverKeyOutput } from './shared.js';

export const regenerateServerKey = defineTool({
  name: 'forge_regenerate_server_key',
  title: 'Regenerate server key',
  description:
    "Replace the server's own SSH key pair. Everything that trusted the old public key (Git providers, other servers) rejects the server until the new public key is added there: confirm with the user first.",
  toolset: 'security',
  operations: ['organizations.servers.key.update'],
  permissions: ['server:delete'],
  readOnly: false,
  destructive: true,
  idempotent: false,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
  },
  outputSchema: serverKeyOutput.shape,
  async handler(args, { client, organization, signal }) {
    const response = await client.put<SingleDocument>(`${serverPath(organization(args.organization), args.server)}/key`, { signal });
    const key = pick(flattenSingle(response.data), ['public_key', 'fingerprint']) as { public_key: string | null; fingerprint: string | null };
    return {
      structured: key,
      summary: `Generated a new key pair (fingerprint ${key.fingerprint}). Add the new public key wherever the old one was trusted.`,
    };
  },
});
