import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { operationOutput, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { databaseRefsInput, resolveDatabaseIds } from '../databases/shared.js';
import {
  BACKUP_CONFIGURATION_NOT_FOUND_HINT,
  BACKUP_TIMES,
  backupConfigurationInput,
  backupConfigurationOutput,
  backupConfigurationPath,
  backupConfigurationPhase,
  FREQUENCIES,
  formatBackupConfiguration,
  resolveStorageProviderId,
  scheduleBody,
  scheduleInput,
  storageProviderRefInput,
  type Schedule,
} from './shared.js';

const CHECK_WITH = 'forge_list_backup_configurations';

type Check = { field: string; matches: (configuration: Record<string, unknown>) => boolean };

const sameIds = (a: unknown, b: readonly number[]) =>
  Array.isArray(a) && a.map(Number).sort((x, y) => x - y).join() === [...b].sort((x, y) => x - y).join();

/** The schedule to send: the requested one, or the current one completed with the requested day, time or cron. */
function mergeSchedule(current: Record<string, unknown>, args: Partial<Schedule>): Schedule {
  if (args.frequency !== undefined) return { frequency: args.frequency, day: args.day, time: args.time, cron: args.cron };
  const frequency = FREQUENCIES.find((value) => value === current.schedule);
  if (!frequency) {
    throw new ToolInputError(`The current schedule ("${String(current.schedule)}") is not a known frequency: pass \`frequency\` too.`);
  }
  const time = typeof current.time === 'string' ? current.time.slice(0, 5) : undefined;
  const keep = <T>(value: T | undefined, fallback: T | undefined, used: boolean) => (used ? (value ?? fallback) : value);
  return {
    frequency,
    day: keep(args.day, typeof current.day_of_week === 'number' ? current.day_of_week : undefined, frequency === 'weekly'),
    time: keep(args.time, time && BACKUP_TIMES.includes(time) ? time : undefined, frequency === 'daily' || frequency === 'weekly'),
    cron: keep(args.cron, typeof current.cron_schedule === 'string' ? current.cron_schedule : undefined, frequency === 'custom'),
  };
}

export const updateBackupConfiguration = defineTool({
  name: 'forge_update_backup_configuration',
  title: 'Update backup configuration',
  description:
    'Change a backup configuration: storage, databases, schedule, retention, name or notification email. Fields not passed keep their current value; `databases` replaces the whole list.',
  toolset: 'databases',
  operations: [
    'organizations.servers.database.backups.update',
    'organizations.servers.database.backups.show',
    'organizations.servers.database.schemas.index',
    'organizations.storage-providers.index',
  ],
  permissions: ['server:create-backups', 'server:view', 'storage:manage'],
  readOnly: false,
  destructive: false,
  idempotent: true,
  async: true,
  notFoundHint: BACKUP_CONFIGURATION_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    backup_configuration: backupConfigurationInput,
    storage_provider: storageProviderRefInput.optional(),
    databases: databaseRefsInput.min(1).optional().describe('Every database to back up, by ID or name (replaces the list).'),
    retention: z.number().int().min(1).max(8760).optional().describe('Number of backups to keep.'),
    frequency: scheduleInput.frequency.optional(),
    day: scheduleInput.day,
    time: scheduleInput.time,
    cron: scheduleInput.cron,
    name: z.string().min(1).max(255).optional().describe('New name.'),
    include_new_databases: z.boolean().optional().describe('Also back up databases created later on this server.'),
    bucket: z.string().min(1).optional().describe("Bucket, if different from the storage provider's."),
    directory: z.string().min(1).optional().describe('Directory inside the bucket.'),
    notification_email: z.string().email().nullable().optional().describe('Email notified when a backup fails; null removes it.'),
    ...waitInput(60),
  },
  outputSchema: {
    ...operationOutput,
    backup_configuration: backupConfigurationOutput.nullable(),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const { organization: _org, server, backup_configuration, wait, timeout_seconds, ...changes } = args;
    if (Object.values(changes).every((value) => value === undefined)) {
      throw new ToolInputError('Pass at least one setting to change.');
    }
    const org = organization(args.organization);
    const path = backupConfigurationPath(org, server, backup_configuration);
    const current = await readResource(client, path, signal);
    const schedule = scheduleBody(mergeSchedule(current, args));
    const storageProviderId =
      args.storage_provider !== undefined ? await resolveStorageProviderId(client, org, args.storage_provider, signal) : current.storage_provider_id;
    if (typeof storageProviderId !== 'number') throw new ToolInputError('The configuration has no storage provider: pass `storage_provider`.');
    const databaseIds = args.databases
      ? await resolveDatabaseIds(client, org, server, args.databases, signal)
      : (current.database_ids as unknown[] | null ?? []).map(Number);

    await client.put(path, {
      body: {
        storage_provider_id: storageProviderId,
        name: args.name ?? current.name,
        bucket: args.bucket ?? current.bucket,
        directory: args.directory ?? current.directory,
        ...schedule,
        include_new_databases: args.include_new_databases ?? current.include_new_databases,
        database_ids: databaseIds,
        retention: args.retention ?? current.retention,
        notification_email: args.notification_email === undefined ? current.notify_email : args.notification_email,
      },
      signal,
    });

    const action = `update backup configuration ${backup_configuration}`;
    const checks: Check[] = [];
    if (args.name !== undefined) checks.push({ field: 'name', matches: (c) => c.name === args.name });
    if (args.retention !== undefined) checks.push({ field: 'retention', matches: (c) => c.retention === args.retention });
    if (args.storage_provider !== undefined) checks.push({ field: 'storage_provider_id', matches: (c) => c.storage_provider_id === storageProviderId });
    if (args.databases !== undefined) checks.push({ field: 'database_ids', matches: (c) => sameIds(c.database_ids, databaseIds) });
    if (args.include_new_databases !== undefined) {
      checks.push({ field: 'include_new_databases', matches: (c) => c.include_new_databases === args.include_new_databases });
    }
    if (args.notification_email !== undefined) checks.push({ field: 'notify_email', matches: (c) => c.notify_email === args.notification_email });
    if (args.bucket !== undefined) checks.push({ field: 'bucket', matches: (c) => c.bucket === args.bucket });
    if (args.directory !== undefined) checks.push({ field: 'directory', matches: (c) => c.directory === args.directory });
    if (args.cron !== undefined) checks.push({ field: 'cron_schedule', matches: (c) => c.cron_schedule === args.cron });

    const nothingToFollow = queued(action, CHECK_WITH, '(schedule changes show up in `displayable_schedule`)');
    if (!wait || checks.length === 0) return { ...nothingToFollow, structured: { ...nothingToFollow.structured, backup_configuration: null } };

    const result = await waitFor({
      poll: () => readResource(client, path, signal),
      phase: (configuration) => {
        const phase = backupConfigurationPhase(configuration.status);
        if (phase !== 'completed') return phase;
        return checks.every((check) => check.matches(configuration)) ? 'completed' : 'pending';
      },
      describe: (configuration) => `Waiting for ${checks.filter((check) => !check.matches(configuration)).map((c) => c.field).join(', ') || configuration.status}`,
      timeoutSeconds: timeout_seconds,
      context: { sleep, progress },
    });
    const done = outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: timeout_seconds });
    return {
      structured: { ...done.structured, backup_configuration: result.value ? formatBackupConfiguration(result.value) : null },
      summary: done.summary,
    };
  },
});
