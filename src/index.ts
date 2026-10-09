#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConfigError, loadConfig, type Config } from './config.js';
import { ForgeClient } from './forge/client.js';
import { ForgeApiError } from './forge/errors.js';
import type { SingleDocument } from './forge/jsonapi.js';
import { logger } from './logger.js';
import { createServer } from './server.js';
import { selectTools } from './tools/registry.js';
import { VERSION } from './version.js';

async function main(): Promise<void> {
  let config: Config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      logger.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const client = new ForgeClient({
    apiToken: config.apiToken,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    userAgent: `laravel-forge-mcp/${VERSION}`,
  });

  const server = createServer({ config, client });
  await server.connect(new StdioServerTransport());

  const toolCount = selectTools(config).length;
  logger.info(
    `v${VERSION} running on stdio: ${toolCount} tool(s), toolsets: ${[...config.toolsets].join(', ')}${config.readOnly ? ', read-only' : ''}.`,
  );

  // Fire-and-forget: report token problems early without blocking the MCP handshake.
  void verifyToken(client);
}

/** Calls GET /me so an invalid token shows up in the logs right away. */
async function verifyToken(client: ForgeClient): Promise<void> {
  try {
    const response = await client.get<SingleDocument>('/me', { signal: AbortSignal.timeout(10_000) });
    const name = response.data.data.attributes?.name;
    logger.info(`Authenticated with Forge${typeof name === 'string' ? ` as ${name}` : ''}.`);
  } catch (error) {
    if (error instanceof ForgeApiError && error.status === 401) {
      logger.warn('FORGE_API_TOKEN was rejected by Forge (401). Tools will fail until a valid token is configured.');
    } else {
      logger.warn(`Could not verify the Forge API token: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
