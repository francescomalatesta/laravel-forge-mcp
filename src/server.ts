import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { CallToolResult, ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Config } from './config.js';
import type { ForgeClient } from './forge/client.js';
import type { AnyToolDefinition, ToolContext } from './tools/define-tool.js';
import { MISSING_ORGANIZATION_MESSAGE, ToolInputError, describeToolError } from './tools/errors.js';
import { selectTools } from './tools/registry.js';
import { VERSION } from './version.js';

export const SERVER_NAME = 'laravel-forge';

const INSTRUCTIONS = `Tools for managing Laravel Forge (servers, sites, deployments and more) through the Forge API.
- Every resource belongs to an organization. If an "organization" argument is required and unknown, call forge_list_organizations first.
- Resources are addressed by ID. Use the list tools (e.g. forge_list_servers) to find IDs instead of guessing.
- List tools are paginated: when "has_more" is true, pass "next_cursor" as "cursor" to get the next page.
- Many write operations are asynchronous in Forge: an accepted request is not yet completed. Follow the outcome with the tool named in the result, or with forge_list_server_events and forge_get_server_event.
- Site and deployment tools need both the server ID and the site ID: forge_list_sites returns both.`;

export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

export interface CreateServerOptions {
  config: Config;
  client: ForgeClient;
  tools?: readonly AnyToolDefinition[];
  /** Injectable for tests. */
  sleep?: Sleep;
}

export function createServer({ config, client, tools, sleep = abortableSleep }: CreateServerOptions): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: VERSION }, { instructions: INSTRUCTIONS });

  for (const tool of tools ?? selectTools(config)) {
    registerTool(server, tool, config, client, sleep);
  }
  return server;
}

function registerTool(server: McpServer, tool: AnyToolDefinition, config: Config, client: ForgeClient, sleep: Sleep): void {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: describe(tool),
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: {
        title: tool.title,
        readOnlyHint: tool.readOnly,
        destructiveHint: tool.destructive ?? !tool.readOnly,
        idempotentHint: tool.idempotent ?? tool.readOnly,
        openWorldHint: true,
      },
    },
    async (
      args: Record<string, unknown>,
      extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
    ): Promise<CallToolResult> => {
      const context: ToolContext = {
        client,
        config,
        signal: extra.signal,
        sleep: (ms) => sleep(ms, extra.signal),
        progress: async (progress, total, message) => {
          const progressToken = extra._meta?.progressToken;
          if (progressToken === undefined) return;
          await extra.sendNotification({
            method: 'notifications/progress',
            params: { progressToken, progress, ...(total !== undefined ? { total } : {}), message },
          });
        },
        organization: (explicit) => {
          const slug = explicit ?? config.organization;
          if (!slug) throw new ToolInputError(MISSING_ORGANIZATION_MESSAGE);
          return slug;
        },
      };

      try {
        const result = await tool.handler(args, context);
        return {
          content: [{ type: 'text', text: `${result.summary}\n\n${JSON.stringify(result.structured)}` }],
          structuredContent: result.structured,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: describeToolError(error, tool) }],
          isError: true,
        };
      }
    },
  );
}

export const ASYNC_NOTE =
  'Forge runs this operation in the background: the result `status` says whether it completed, failed, is still in progress or was only queued, and `check_with` names the tool that shows its current state.';

function describe(tool: AnyToolDefinition): string {
  const async = tool.async ? `\n\n${ASYNC_NOTE}` : '';
  const permissions = tool.permissions.length > 0 ? `\n\nRequired Forge permission: ${tool.permissions.join(', ')}.` : '';
  return `${tool.description}${async}${permissions}`;
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
