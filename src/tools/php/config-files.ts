import { z } from 'zod';
import type { ForgeClient } from '../../forge/client.js';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';

export const phpConfigInput = z
  .enum(['fpm', 'cli', 'pool'])
  .describe('"fpm": php.ini used by PHP-FPM (web requests); "cli": php.ini of the `php` command; "pool": PHP-FPM pool configuration (workers, user).');

export const poolUserInput = z
  .string()
  .min(1)
  .optional()
  .describe('Pool only: the Linux user of an isolated site\'s pool (default: the "forge" pool).');

export async function readPhpConfig(
  client: ForgeClient,
  path: string,
  user: string | undefined,
  signal: AbortSignal,
): Promise<string> {
  const response = await client.get<SingleDocument>(path, { query: { user }, signal });
  return (flattenSingle(response.data).configuration as string | null | undefined) ?? '';
}
