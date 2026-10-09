import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { serverLogKeyInput } from './server-logs.js';
import { SERVER_NOT_FOUND_HINT, serverPath } from './shared.js';

const CHECK_WITH = 'forge_get_server_log';

export const clearServerLog = defineTool({
  name: 'forge_clear_server_log',
  title: 'Clear server log',
  description: 'Empty a server-level log. The previous content is lost.',
  toolset: 'servers',
  operations: ['organizations.servers.logs.destroy', 'organizations.servers.logs.show'],
  permissions: ['server:manage-logs'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    key: serverLogKeyInput,
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = `${serverPath(organization(args.organization), args.server)}/logs/${encodeURIComponent(args.key)}`;
    await client.delete(path, { signal });
    const action = `clear the ${args.key} log`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: async () => {
        const response = await client.get<SingleDocument>(path, { signal });
        return ((flattenSingle(response.data).content as string | null | undefined) ?? '').trim();
      },
      phase: (content) => (content === '' ? 'completed' : 'pending'),
      describe: () => `Waiting for the ${args.key} log to be cleared`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
