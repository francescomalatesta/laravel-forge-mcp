import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { organizationInput, paginationInput, paginationOutput, paginationSummary, serverInput } from '../shared/schemas.js';
import {
  BACKUP_CONFIGURATION_NOT_FOUND_HINT,
  backupConfigurationInput,
  backupInput,
  backupOutput,
  backupsPath,
  formatBackup,
} from './shared.js';

const SORT = ['created_at', '-created_at', 'updated_at', '-updated_at'] as const;

export const listBackups = defineTool({
  name: 'forge_list_backups',
  title: 'List backups',
  description:
    'List the backups produced by a backup configuration (status, size, completion time), or get one with `backup`. Restore one with forge_restore_backup.',
  toolset: 'databases',
  operations: ['organizations.servers.database.backups.instances.index', 'organizations.servers.database.backups.instances.show'],
  permissions: ['server:create-backups'],
  readOnly: true,
  notFoundHint: BACKUP_CONFIGURATION_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    backup_configuration: backupConfigurationInput,
    backup: backupInput.optional().describe('Return only this backup.'),
    status: z.string().min(1).optional().describe('Filter by status, e.g. "finished".'),
    sort: z.array(z.enum(SORT)).min(1).optional().describe('Defaults to newest first.'),
    ...paginationInput,
  },
  outputSchema: {
    backups: z.array(backupOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const base = backupsPath(organization(args.organization), args.server, args.backup_configuration);
    if (args.backup !== undefined) {
      const backup = formatBackup(await readResource(client, `${base}/${encodeURIComponent(String(args.backup))}`, signal));
      return { structured: { backups: [backup], next_cursor: null, has_more: false }, summary: `Backup ${backup.id} is ${backup.status}.` };
    }
    const response = await client.get<CollectionDocument>(base, {
      query: { filter: { status: args.status }, sort: args.sort ?? ['-created_at'], page: { size: args.page_size, cursor: args.cursor } },
      signal,
    });
    const page = flattenCollection(response.data);
    const backups = page.items.map(formatBackup);
    return {
      structured: { backups, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        backups.length === 0
          ? 'No backups found. Run one now with forge_create_backup.'
          : `Found ${backups.length} backup(s); the first is ${backups[0]!.id} (${backups[0]!.status}).${paginationSummary(page.nextCursor)}`,
    };
  },
});
