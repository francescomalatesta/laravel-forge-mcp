import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, waitFor, waitInput } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import { databaseRefsInput, resolveDatabaseIds } from '../databases/shared.js';
import {
  backupConfigurationOutput,
  backupConfigurationPhase,
  backupConfigurationsPath,
  formatBackupConfiguration,
  newestFirst,
  resolveStorageProviderId,
  scheduleBody,
  scheduleInput,
  storageProviderRefInput,
} from './shared.js';

const CHECK_WITH = 'forge_list_backup_configurations';

export const createBackupConfiguration = defineTool({
  name: 'forge_create_backup_configuration',
  title: 'Create backup configuration',
  description:
    'Schedule database backups on a server to a storage provider (S3, Spaces, …): which databases, how often, how many to keep. Waits until the configuration is installed unless `wait` is false. Run a backup immediately with forge_create_backup.',
  toolset: 'databases',
  operations: [
    'organizations.servers.database.backups.store',
    'organizations.servers.database.backups.index',
    'organizations.servers.database.schemas.index',
    'organizations.storage-providers.index',
  ],
  permissions: ['server:create-backups', 'server:view', 'storage:manage'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    storage_provider: storageProviderRefInput,
    databases: databaseRefsInput.min(1).describe('Databases to back up, by ID or name, e.g. [12, "shop"].'),
    retention: z.number().int().min(1).max(8760).describe('Number of backups to keep (older ones are deleted).'),
    ...scheduleInput,
    name: z.string().min(1).max(255).optional().describe('Name of the configuration.'),
    include_new_databases: z.boolean().optional().describe('Also back up databases created later on this server.'),
    bucket: z.string().min(1).optional().describe("Bucket, if different from the storage provider's."),
    directory: z.string().min(1).optional().describe('Directory inside the bucket.'),
    notification_email: z.string().email().optional().describe('Email notified when a backup fails.'),
    ...waitInput(120),
  },
  outputSchema: {
    ...operationOutput,
    backup_configuration: backupConfigurationOutput.nullable().describe('The new configuration once it shows up.'),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const schedule = scheduleBody(args);
    const org = organization(args.organization);
    const storageProviderId = await resolveStorageProviderId(client, org, args.storage_provider, signal);
    const databaseIds = await resolveDatabaseIds(client, org, args.server, args.databases, signal);
    const base = backupConfigurationsPath(org, args.server);
    // Forge returns no body: remember the existing configurations to spot the new one.
    const existing = args.wait ? new Set((await newestFirst(client, base, signal)).map((item) => item.id)) : undefined;

    await client.post(base, {
      body: {
        storage_provider_id: storageProviderId,
        name: args.name,
        bucket: args.bucket,
        directory: args.directory,
        ...schedule,
        include_new_databases: args.include_new_databases,
        database_ids: databaseIds,
        retention: args.retention,
        notification_email: args.notification_email,
      },
      signal,
    });
    const action = `create the backup configuration${args.name ? ` ${args.name}` : ''}`;
    if (!existing) {
      return {
        structured: { status: 'queued' as const, check_with: CHECK_WITH, backup_configuration: null },
        summary: `Forge accepted the request to ${action}; it runs in the background. Check it with ${CHECK_WITH}.`,
      };
    }

    const result = await waitFor({
      poll: async () => (await newestFirst(client, base, signal)).find((item) => !existing.has(item.id)) ?? null,
      phase: (configuration) => (configuration ? backupConfigurationPhase(configuration.status) : 'pending'),
      describe: (configuration) => (configuration ? `Backup configuration is ${configuration.status}` : 'Waiting for the configuration to appear'),
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const configuration = result.value ? formatBackupConfiguration(result.value) : null;
    const done = outcome(result, {
      action,
      checkWith: CHECK_WITH,
      timeoutSeconds: args.timeout_seconds,
      detail: configuration ? `Configuration ID: ${configuration.id}; next run: ${configuration.next_run_time}.` : undefined,
    });
    return { structured: { ...done.structured, backup_configuration: configuration }, summary: done.summary };
  },
});
