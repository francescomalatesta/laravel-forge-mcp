import { z } from 'zod';
import type { ForgeClient } from '../../forge/client.js';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { phaseOf, type Phase } from '../shared/async.js';
import { pick } from '../shared/schemas.js';
import { ToolInputError } from '../errors.js';
import { serverPath } from '../servers/shared.js';

/** Version numbers used by the default-version endpoints, matching the install identifiers. */
const VERSION_NUMBERS: Record<string, string> = {
  php56: '5.6',
  php70: '7.0',
  php71: '7.1',
  php72: '7.2',
  php73: '7.3',
  php74: '7.4',
  php80: '8.0',
  php81: '8.1',
  php82: '8.2',
  php83: '8.3',
  php84: '8.4',
  php85: '8.5',
};

export const PHP_VERSION_NUMBERS = ['5.6', '7.0', '7.1', '7.2', '7.3', '7.4', '8.0', '8.1', '8.2', '8.3', '8.4', '8.5'] as const;

/** "php83", "8.3", "php8.3" or "PHP 8.3" → "8.3"; undefined when not a known version. */
export function versionNumber(value: string): string | undefined {
  const compact = value.trim().toLowerCase().replace(/\s+/g, '');
  const dotted = compact.replace(/^php/, '');
  if ((PHP_VERSION_NUMBERS as readonly string[]).includes(dotted)) return dotted;
  return VERSION_NUMBERS[compact];
}

export const phpVersionRefInput = z
  .union([z.number().int().nonnegative(), z.string().min(1)])
  .describe('Installed PHP version: its ID (from forge_list_php_versions) or the version, e.g. "8.3" or "php83".');

export function phpVersionsPath(org: string, server: string | number): string {
  return `${serverPath(org, server)}/php/versions`;
}

export const phpVersionOutput = z.looseObject({
  id: z.string().describe('PHP version ID.'),
  version: z.string().nullable().describe('e.g. "8.3".'),
  binary_name: z.string().nullable().describe('e.g. "php8.3".'),
  status: z.string().nullable(),
  created_at: z.string().nullable(),
});

export type PhpVersionOutput = z.output<typeof phpVersionOutput>;

export function formatPhpVersion(flat: Record<string, unknown>): PhpVersionOutput {
  return pick(flat, ['id', 'version', 'binary_name', 'status', 'created_at']) as PhpVersionOutput;
}

/** Installed version with this number, or undefined. */
export async function findPhpVersion(
  client: ForgeClient,
  org: string,
  server: string | number,
  number: string,
  signal: AbortSignal,
): Promise<PhpVersionOutput | undefined> {
  const response = await client.get<CollectionDocument>(phpVersionsPath(org, server), {
    query: { filter: { version: number }, page: { size: 100 } },
    signal,
  });
  const match = flattenCollection(response.data).items.find((item) => item.version === number);
  return match ? formatPhpVersion(match) : undefined;
}

/** Resolves an ID or a version ("8.3", "php83") to the ID of the installed version. */
export async function resolvePhpVersionId(
  client: ForgeClient,
  org: string,
  server: string | number,
  ref: string | number,
  signal: AbortSignal,
): Promise<string> {
  // Digits only is an ID; versions are written with a dot ("8.3") or a "php" prefix.
  if (typeof ref === 'number' || /^\d+$/.test(ref)) return String(ref);
  const number = versionNumber(ref);
  if (!number) throw new ToolInputError(`Unknown PHP version "${ref}": use an ID from forge_list_php_versions or a version like "8.3".`);
  const installed = await findPhpVersion(client, org, server, number, signal);
  if (!installed) {
    throw new ToolInputError(`PHP ${number} is not installed on server ${server}. Install it with forge_install_php_version.`);
  }
  return installed.id;
}

export function phpVersionPhase(status: unknown): Phase {
  return phaseOf(status, { pending: ['installing', 'updating', 'removing', 'uninstalling'], failed: ['failed'] });
}
