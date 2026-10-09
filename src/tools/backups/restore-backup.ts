import { z } from 'zod';
import { defineTool } from '../define-tool.js';
import { operationOutput, queued } from '../shared/async.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { resolveDatabaseIds } from '../databases/shared.js';
import { backupConfigurationInput, backupInput, backupsPath } from './shared.js';

export const restoreBackup = defineTool({
  name: 'forge_restore_backup',
  title: 'Restore backup',
  description:
    'Restore a database from a backup. This OVERWRITES the current content of the database with the backup: data written since the backup is lost. Confirm with the user first and consider running forge_create_backup before.',
  toolset: 'databases',
  operations: ['organizations.servers.database.backups.instances.restores.store', 'organizations.servers.database.schemas.index'],
  permissions: ['server:create-backups', 'server:view'],
  readOnly: false,
  destructive: true,
  idempotent: false,
  async: true,
  notFoundHint: 'Check the backup configuration ID with forge_list_backup_configurations and the backup ID with forge_list_backups.',
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    backup_configuration: backupConfigurationInput,
    backup: backupInput,
    database: z
      .union([z.number().int().nonnegative(), z.string().min(1)])
      .describe('Database to restore, by ID or name (it must be included in the backup).'),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal }) {
    const org = organization(args.organization);
    const [databaseId] = await resolveDatabaseIds(client, org, args.server, [args.database], signal);
    const path = `${backupsPath(org, args.server, args.backup_configuration)}/${encodeURIComponent(String(args.backup))}/restores`;
    await client.post(path, { body: { database_id: databaseId }, signal });
    // The API exposes no restore status: Forge records the outcome as a server event.
    return queued(`restore database ${args.database} from backup ${args.backup}`, 'forge_list_server_events');
  },
});
