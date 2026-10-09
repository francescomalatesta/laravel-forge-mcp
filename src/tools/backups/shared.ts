import { z } from 'zod';
import type { ForgeClient } from '../../forge/client.js';
import { flattenCollection, type CollectionDocument, type FlatResource } from '../../forge/jsonapi.js';
import { ToolInputError } from '../errors.js';
import { phaseOf, type Phase } from '../shared/async.js';
import { idInput, pick } from '../shared/schemas.js';
import { serverPath } from '../servers/shared.js';
import { storageProvidersPath } from '../storage/shared.js';

export function backupConfigurationsPath(org: string, server: string | number): string {
  return `${serverPath(org, server)}/database/backups`;
}

export function backupConfigurationPath(org: string, server: string | number, configuration: string | number): string {
  return `${backupConfigurationsPath(org, server)}/${encodeURIComponent(String(configuration))}`;
}

export function backupsPath(org: string, server: string | number, configuration: string | number): string {
  return `${backupConfigurationPath(org, server, configuration)}/instances`;
}

export const backupConfigurationInput = idInput('Backup configuration ID. Use forge_list_backup_configurations to find it.');
export const backupInput = idInput('Backup ID. Use forge_list_backups to find it.');

export const BACKUP_CONFIGURATION_NOT_FOUND_HINT =
  'Check the server ID with forge_list_servers and the backup configuration ID with forge_list_backup_configurations.';

export const storageProviderRefInput = z
  .union([z.number().int().nonnegative(), z.string().min(1)])
  .describe('Storage provider (S3, Spaces, …) by ID or name. Use forge_list_storage_providers (storage toolset) to find it.');

export const FREQUENCIES = ['hourly', 'daily', 'weekly', 'custom'] as const;

/** Backups start on the hour or half hour (server time). */
export const BACKUP_TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`) as [
  string,
  ...string[],
];

export const scheduleInput = {
  frequency: z.enum(FREQUENCIES).describe('hourly, daily (at `time`), weekly (on `day` at `time`) or custom (`cron`).'),
  day: z.number().int().min(0).max(6).optional().describe('Weekly backups only: day of the week, cron numbering (0 = Sunday … 6 = Saturday).'),
  time: z.enum(BACKUP_TIMES).optional().describe('Daily and weekly backups only: time of day, on the hour or half hour, e.g. "03:30".'),
  cron: z.string().min(1).optional().describe('Custom frequency only: cron expression, e.g. "0 */6 * * *".'),
};

export interface Schedule {
  frequency: (typeof FREQUENCIES)[number];
  day?: number | undefined;
  time?: string | undefined;
  cron?: string | undefined;
}

/** Validates that schedule fields match the frequency and maps them to the request body. */
export function scheduleBody({ frequency, day, time, cron }: Schedule) {
  if (frequency === 'custom' && cron === undefined) throw new ToolInputError('A custom frequency needs a `cron` expression.');
  if (frequency !== 'custom' && cron !== undefined) throw new ToolInputError('`cron` is only used with frequency "custom".');
  if (frequency !== 'weekly' && day !== undefined) throw new ToolInputError('`day` is only used with frequency "weekly".');
  if ((frequency === 'hourly' || frequency === 'custom') && time !== undefined) {
    throw new ToolInputError('`time` is only used with frequency "daily" or "weekly".');
  }
  return { frequency, day: day === undefined ? undefined : String(day), time, cron };
}

const CONFIGURATION_FIELDS = [
  'id',
  'name',
  'status',
  'storage_provider_id',
  'provider',
  'bucket',
  'directory',
  'displayable_schedule',
  'next_run_time',
  'schedule',
  'day_of_week',
  'time',
  'cron_schedule',
  'database_ids',
  'include_new_databases',
  'retention',
  'notify_email',
] as const;

export const backupConfigurationOutput = z.looseObject({
  id: z.string(),
  name: z.string().nullable(),
  status: z.string().nullable().describe('e.g. installing, installed, removing.'),
  storage_provider_id: z.number().nullable(),
  provider: z.string().nullable(),
  bucket: z.string().nullable(),
  directory: z.string().nullable(),
  displayable_schedule: z.string().nullable(),
  next_run_time: z.string().nullable(),
  schedule: z.string().nullable(),
  day_of_week: z.number().nullable(),
  time: z.string().nullable(),
  cron_schedule: z.string().nullable(),
  database_ids: z.array(z.unknown()).nullable(),
  include_new_databases: z.boolean().nullable(),
  retention: z.number().nullable().describe('Number of backups kept.'),
  notify_email: z.string().nullable(),
});

export type BackupConfigurationOutput = z.output<typeof backupConfigurationOutput>;

export function formatBackupConfiguration(flat: Record<string, unknown>): BackupConfigurationOutput {
  return pick(flat, CONFIGURATION_FIELDS) as BackupConfigurationOutput;
}

export function backupConfigurationPhase(status: unknown): Phase {
  return phaseOf(status, { pending: ['installing', 'updating', 'removing'], failed: ['failed'] });
}

export const backupOutput = z.looseObject({
  id: z.string(),
  status: z.string().nullable().describe('"finished" when the backup succeeded.'),
  is_partial: z.unknown().nullable().describe('Whether some databases could not be backed up.'),
  size: z.number().nullable().describe('Size in bytes.'),
  finished_at: z.number().nullable().describe('Unix timestamp.'),
});

export type BackupOutput = z.output<typeof backupOutput>;

export function formatBackup(flat: Record<string, unknown>): BackupOutput {
  return pick(flat, ['id', 'status', 'is_partial', 'size', 'finished_at']) as BackupOutput;
}

/** Only "finished" means the backup succeeded: any other value is still running. */
export function backupPhase(status: unknown): Phase {
  return phaseOf(status, { completed: ['finished'], failed: ['failed'] });
}

/** First page of a collection, newest first: used to spot items created by a write that returns no body. */
export async function newestFirst(client: ForgeClient, path: string, signal: AbortSignal): Promise<FlatResource[]> {
  const response = await client.get<CollectionDocument>(path, { query: { sort: ['-created_at'], page: { size: 100 } }, signal });
  return flattenCollection(response.data).items;
}

/** Resolves a storage provider ID or name to its ID. */
export async function resolveStorageProviderId(
  client: ForgeClient,
  org: string,
  ref: string | number,
  signal: AbortSignal,
): Promise<number> {
  if (typeof ref === 'number' || /^\d+$/.test(ref)) return Number(ref);
  const response = await client.get<CollectionDocument>(storageProvidersPath(org), { query: { page: { size: 100 } }, signal });
  const match = flattenCollection(response.data).items.find((provider) => provider.name === ref);
  if (!match) {
    throw new ToolInputError(`Storage provider "${ref}" not found. Check the name with forge_list_storage_providers (storage toolset).`);
  }
  return Number(match.id);
}
