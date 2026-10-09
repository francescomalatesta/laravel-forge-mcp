import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { organizationInput, pick, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT, serverPath } from '../servers/shared.js';
import { serverKeyOutput } from './shared.js';

export const getServerPublicKey = defineTool({
  name: 'forge_get_server_public_key',
  title: 'Get server public key',
  description:
    "The server's own public SSH key: add it to a Git provider or to another server so this server can connect to them.",
  toolset: 'security',
  operations: ['organizations.servers.key.show'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
  },
  outputSchema: serverKeyOutput.shape,
  async handler(args, { client, organization, signal }) {
    const key = pick(await readResource(client, `${serverPath(organization(args.organization), args.server)}/key`, signal), [
      'public_key',
      'fingerprint',
    ]) as { public_key: string | null; fingerprint: string | null };
    return { structured: key, summary: `Server public key fingerprint: ${key.fingerprint}.` };
  },
});
