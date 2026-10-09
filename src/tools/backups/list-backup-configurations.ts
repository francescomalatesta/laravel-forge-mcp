import { z } from 'zod';
import { flattenCollection, type CollectionDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { readResource } from '../shared/read.js';
import { organizationInput, paginationInput, paginationOutput, paginationSummary, serverInput } from '../shared/schemas.js';
import { SERVER_NOT_FOUND_HINT } from '../servers/shared.js';
import {
  backupConfigurationInput,
  backupConfigurationOutput,
  backupConfigurationPath,
  backupConfigurationsPath,
  formatBackupConfiguration,
} from './shared.js';

const SORT = ['name', '-name', 'created_at', '-created_at', 'updated_at', '-updated_at'] as const;

export const listBackupConfigurations = defineTool({
  name: 'forge_list_backup_configurations',
  title: 'List backup configurations',
  description:
    'List the database backup configurations of a server (schedule, storage, databases, retention, next run), or get one with `backup_configuration`. Use forge_list_backups to see the backups it produced.',
  toolset: 'databases',
  operations: ['organizations.servers.database.backups.index', 'organizations.servers.database.backups.show'],
  permissions: ['server:view'],
  readOnly: true,
  notFoundHint: SERVER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    server: serverInput,
    backup_configuration: backupConfigurationInput.optional().describe('Return only this backup configuration.'),
    name: z.string().min(1).optional().describe('Filter by name.'),
    status: z.string().min(1).optional().describe('Filter by status, e.g. "installed".'),
    sort: z.array(z.enum(SORT)).min(1).optional(),
    ...paginationInput,
  },
  outputSchema: {
    backup_configurations: z.array(backupConfigurationOutput),
    ...paginationOutput,
  },
  async handler(args, { client, organization, signal }) {
    const org = organization(args.organization);
    if (args.backup_configuration !== undefined) {
      const configuration = formatBackupConfiguration(
        await readResource(client, backupConfigurationPath(org, args.server, args.backup_configuration), signal),
      );
      return {
        structured: { backup_configurations: [configuration], next_cursor: null, has_more: false },
        summary: `Backup configuration ${configuration.name} is ${configuration.status}; schedule: ${configuration.displayable_schedule}, next run: ${configuration.next_run_time}.`,
      };
    }
    const response = await client.get<CollectionDocument>(backupConfigurationsPath(org, args.server), {
      query: { filter: { name: args.name, status: args.status }, sort: args.sort, page: { size: args.page_size, cursor: args.cursor } },
      signal,
    });
    const page = flattenCollection(response.data);
    const configurations = page.items.map(formatBackupConfiguration);
    return {
      structured: { backup_configurations: configurations, next_cursor: page.nextCursor, has_more: page.nextCursor !== null },
      summary:
        configurations.length === 0
          ? 'No backup configurations found. Create one with forge_create_backup_configuration.'
          : `Found ${configurations.length} backup configuration(s): ${configurations
              .map((c) => `${c.name} (${c.id}, ${c.displayable_schedule})`)
              .join(', ')}.${paginationSummary(page.nextCursor)}`,
    };
  },
});
