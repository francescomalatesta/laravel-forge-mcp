import { defineTool } from '../define-tool.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { backupConfigurationInput, backupInput, backupsPath } from './shared.js';

const CHECK_WITH = 'forge_list_backups';

export const deleteBackup = defineTool({
  name: 'forge_delete_backup',
  title: 'Delete backup',
  description: 'Delete a backup from storage. It can no longer be restored.',
  toolset: 'databases',
  operations: ['organizations.servers.database.backups.instances.destroy', 'organizations.servers.database.backups.instances.show'],
  permissions: ['server:delete-backups', 'server:create-backups'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: 'Check the backup configuration ID with forge_list_backup_configurations and the backup ID with forge_list_backups.',
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    backup_configuration: backupConfigurationInput,
    backup: backupInput,
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = `${backupsPath(organization(args.organization), args.server, args.backup_configuration)}/${encodeURIComponent(String(args.backup))}`;
    await client.delete(path, { signal });
    const action = `delete backup ${args.backup}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => orGone(() => readResource(client, path, signal)),
      phase: (backup) => (backup === null ? 'completed' : 'pending'),
      describe: () => 'Waiting for the backup to be deleted',
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
