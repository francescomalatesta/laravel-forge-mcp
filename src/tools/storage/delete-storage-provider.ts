import { z } from 'zod';
import { ForgeApiError } from '../../forge/errors.js';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { organizationInput } from '../shared/schemas.js';
import { STORAGE_PROVIDER_NOT_FOUND_HINT, storageProviderInput, storageProviderPath } from './shared.js';

export const deleteStorageProvider = defineTool({
  name: 'forge_delete_storage_provider',
  title: 'Delete storage provider',
  description:
    'Remove a storage provider from the organization. Backups already stored in the bucket are not deleted. Forge refuses while backup configurations use it.',
  toolset: 'storage',
  operations: ['organizations.storage-providers.destroy'],
  permissions: ['storage:manage'],
  readOnly: false,
  destructive: true,
  idempotent: true,
  notFoundHint: STORAGE_PROVIDER_NOT_FOUND_HINT,
  inputSchema: {
    organization: organizationInput,
    storage_provider: storageProviderInput,
  },
  outputSchema: {
    deleted: z.boolean(),
  },
  async handler(args, { client, organization, signal }) {
    try {
      await client.delete(storageProviderPath(organization(args.organization), args.storage_provider), { signal });
    } catch (error) {
      if (error instanceof ForgeApiError && error.status === 409) {
        throw new ToolInputError(
          `Storage provider ${args.storage_provider} is used by backup configurations: move them to another provider (forge_update_backup_configuration) or delete them (forge_delete_backup_configuration) first.`,
        );
      }
      throw error;
    }
    return { structured: { deleted: true }, summary: `Deleted storage provider ${args.storage_provider}.` };
  },
});
