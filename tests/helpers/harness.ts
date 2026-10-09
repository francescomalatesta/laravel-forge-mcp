import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from '../../src/config.js';
import { ForgeClient } from '../../src/forge/client.js';
import { createServer } from '../../src/server.js';
import { createMockFetch, type MockHandler } from './mock-fetch.js';

export const TEST_BASE_URL = 'https://forge.test/api';

/**
 * Boots the real MCP server against a mocked Forge API and connects an
 * in-memory MCP client to it.
 */
export async function createHarness(options: { env?: Record<string, string>; responses?: MockHandler[] } = {}) {
  const config = loadConfig({
    FORGE_API_TOKEN: 'test-token',
    FORGE_API_URL: TEST_BASE_URL,
    FORGE_ORGANIZATION: 'acme',
    ...options.env,
  });
  const mock = createMockFetch(...(options.responses ?? []));
  const forge = new ForgeClient({
    apiToken: config.apiToken,
    baseUrl: config.baseUrl,
    maxRetries: 0,
    fetch: mock.fetch,
    sleep: async () => {},
  });

  const server = createServer({ config, client: forge, sleep: async () => {} });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    requests: mock.requests,
    async call(name: string, args: Record<string, unknown> = {}) {
      return (await client.callTool({ name, arguments: args })) as CallToolResult;
    },
    async close() {
      await client.close();
      await server.close();
    },
  };
}

export function textOf(result: CallToolResult): string {
  return result.content
    .filter((item): item is { type: 'text'; text: string } => item.type === 'text')
    .map((item) => item.text)
    .join('\n');
}
