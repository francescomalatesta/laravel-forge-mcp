import type { ForgeClient } from '../../forge/client.js';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { serverPath } from '../servers/shared.js';

/** Reads one PHP setting endpoint (`/php/<name>`) and returns its attributes. */
export async function readPhpSetting(
  client: ForgeClient,
  org: string,
  server: string | number,
  name: 'cli-version' | 'site-version' | 'max-upload-size' | 'max-execution-time' | 'opcache',
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await client.get<SingleDocument>(`${serverPath(org, server)}/php/${name}`, { signal });
  return flattenSingle(response.data);
}
