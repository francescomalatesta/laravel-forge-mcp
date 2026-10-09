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
- Many write operations are asynchronous in Forge: an accepted request is not yet completed.`;

export interface CreateServerOptions {
  config: Config;
  client: ForgeClient;
  tools?: readonly AnyToolDefinition[];
}

export function createServer({ config, client, tools }: CreateServerOptions): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: VERSION }, { instructions: INSTRUCTIONS });

  for (const tool of tools ?? selectTools(config)) {
    registerTool(server, tool, config, client);
  }
  return server;
}

function registerTool(server: McpServer, tool: AnyToolDefinition, config: Config, client: ForgeClient): void {
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

function describe(tool: AnyToolDefinition): string {
  const permissions = tool.permissions.length > 0 ? `\n\nRequired Forge permission: ${tool.permissions.join(', ')}.` : '';
  return `${tool.description}${permissions}`;
}
