import { defineTool } from '../define-tool.js';
import { operationOutput, outcome, waitFor, waitInput } from '../shared/async.js';
import { findNew, listNewestFirst } from '../shared/read.js';
import { organizationInput, serverInput } from '../shared/schemas.js';
import {
  BACKUP_CONFIGURATION_NOT_FOUND_HINT,
  backupConfigurationInput,
  backupOutput,
  backupPhase,
  backupsPath,
  formatBackup,
} from './shared.js';

const CHECK_WITH = 'forge_list_backups';

export const createBackup = defineTool({
  name: 'forge_create_backup',
  title: 'Run backup now',
  description:
    'Back up the databases of a backup configuration now, outside its schedule (e.g. before a risky deployment or migration). Waits until the backup finishes unless `wait` is false.',
  toolset: 'databases',
  operations: ['organizations.servers.database.backups.instances.store', 'organizations.servers.database.backups.instances.index'],
  permissions: ['server:create-backups'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  async: true,
  notFoundHint: BACKUP_CONFIGURATION_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    backup_configuration: backupConfigurationInput,
    ...waitInput(300),
  },
  outputSchema: {
    ...operationOutput,
    backup: backupOutput.nullable().describe('The new backup once it shows up.'),
  },
  async handler(args, { client, organization, signal, sleep, progress }) {
    const base = backupsPath(organization(args.organization), args.server, args.backup_configuration);
    // Forge returns no body: remember the existing backups to spot the new one.
    const existing = args.wait ? new Set((await listNewestFirst(client, base, signal)).map((item) => item.id)) : undefined;
    await client.post(base, { signal });
    const action = `back up configuration ${args.backup_configuration}`;
    if (!existing) {
      return {
        structured: { status: 'queued' as const, check_with: CHECK_WITH, backup: null },
        summary: `Forge accepted the request to ${action}; it runs in the background. Check it with ${CHECK_WITH}.`,
      };
    }

    const result = await waitFor({
      poll: async () => findNew(await listNewestFirst(client, base, signal), existing),
      phase: (backup) => (backup ? backupPhase(backup.status) : 'pending'),
      describe: (backup) => (backup ? `Backup is ${backup.status}` : 'Waiting for the backup to start'),
      timeoutSeconds: args.timeout_seconds,
      context: { sleep, progress },
    });
    const backup = result.value ? formatBackup(result.value) : null;
    const done = outcome(result, {
      action,
      checkWith: CHECK_WITH,
      timeoutSeconds: args.timeout_seconds,
      detail: backup ? `Backup ID: ${backup.id}.` : undefined,
    });
    return { structured: { ...done.structured, backup }, summary: done.summary };
  },
});
