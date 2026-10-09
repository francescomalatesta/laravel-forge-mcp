import { defineTool } from '../define-tool.js';
import { operationOutput, orGone, outcome, queued, waitFor, waitInput } from '../shared/async.js';
import { readResource } from '../shared/read.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import { BACKUP_CONFIGURATION_NOT_FOUND_HINT, backupConfigurationInput, backupConfigurationPath } from './shared.js';

const CHECK_WITH = 'forge_list_backup_configurations';

export const deleteBackupConfiguration = defineTool({
  name: 'forge_delete_backup_configuration',
  title: 'Delete backup configuration',
  description: 'Stop scheduled backups by deleting a backup configuration. The databases are not touched.',
  toolset: 'databases',
  operations: ['organizations.servers.database.backups.destroy', 'organizations.servers.database.backups.show'],
  permissions: ['server:delete-backups', 'server:view'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  async: true,
  notFoundHint: BACKUP_CONFIGURATION_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    backup_configuration: backupConfigurationInput,
    ...waitInput(60),
  },
  outputSchema: operationOutput,
  async handler(args, { client, organization, signal, sleep, progress }) {
    const path = backupConfigurationPath(organization(args.organization), args.server, args.backup_configuration);
    await client.delete(path, { signal });
    const action = `delete backup configuration ${args.backup_configuration}`;
    if (!args.wait) return queued(action, CHECK_WITH);

    const result = await waitFor({
      poll: () => orGone(() => readResource(client, path, signal)),
      phase: (configuration) => (configuration === null ? 'completed' : 'pending'),
      describe: (configuration) => `Backup configuration is ${configuration?.status ?? 'removing'}`,
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    return outcome(result, { action, checkWith: CHECK_WITH, timeoutSeconds: args.timeout_seconds });
  },
});
