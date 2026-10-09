import { z } from 'zod';
import type { ForgeClient } from '../../forge/client.js';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import type { ToolContext } from '../define-tool.js';
import { waitFor, type WaitResult } from '../shared/async.js';
import { sameEnv } from './env-file.js';

/** Options of the environment update endpoint shared by the .env tools. */
export const environmentUpdateOptions = {
  cache: z.boolean().optional().describe('Cache the configuration after updating (`php artisan config:cache`).'),
  queues: z.boolean().optional().describe('Restart queue workers after updating.'),
};

export async function readEnvironment(client: ForgeClient, base: string, signal: AbortSignal): Promise<string> {
  const response = await client.get<SingleDocument>(`${base}/environment`, { signal });
  return (flattenSingle(response.data).content as string | null | undefined) ?? '';
}

/** Writes the .env file and, when asked, waits until Forge serves the new content. */
export async function writeEnvironment(
  client: ForgeClient,
  base: string,
  content: string,
  options: { cache?: boolean | undefined; queues?: boolean | undefined; wait: boolean; timeoutSeconds: number },
  context: Pick<ToolContext, 'signal' | 'sleep' | 'progress'>,
): Promise<WaitResult<string> | undefined> {
  await client.put(`${base}/environment`, {
    body: { environment: content, cache: options.cache, queues: options.queues },
    signal: context.signal,
  });
  if (!options.wait) return undefined;
  return waitFor({
    poll: () => readEnvironment(client, base, context.signal),
    phase: (current) => (sameEnv(current, content) ? 'completed' : 'pending'),
    describe: () => 'Waiting for Forge to write the .env file',
    timeoutSeconds: options.timeoutSeconds,
    context,
  });
}
