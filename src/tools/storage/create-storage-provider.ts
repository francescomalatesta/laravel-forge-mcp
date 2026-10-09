import { z } from 'zod';
import { flattenSingle, type SingleDocument } from '../../forge/jsonapi.js';
import { defineTool } from '../define-tool.js';
import { ToolInputError } from '../errors.js';
import { organizationInput } from '../shared/schemas.js';
import { formatStorageProvider, STORAGE_PROVIDERS, storageProviderOutput, storageProvidersPath, storageSettingsInput } from './shared.js';

export const createStorageProvider = defineTool({
  name: 'forge_create_storage_provider',
  title: 'Create storage provider',
  description:
    'Add a storage provider (S3, DigitalOcean Spaces, Hetzner, OVH, Scaleway or S3-compatible) for database backups. Then use its ID with forge_create_backup_configuration.',
  toolset: 'storage',
  operations: ['organizations.storage-providers.store'],
  permissions: ['storage:manage'],
  readOnly: false,
  destructive: false,
  idempotent: false,
  inputSchema: {
    organization: organizationInput,
    name: z.string().min(1).max(255).describe('Name of the storage provider.'),
    provider: z.enum(STORAGE_PROVIDERS).describe('s3, spaces, hetzner, ovh, scaleway or custom (S3 compatible, needs `endpoint`).'),
    ...storageSettingsInput,
  },
  outputSchema: {
    storage_provider: storageProviderOutput,
  },
  async handler(args, { client, organization, signal }) {
    if ((args.access_key === undefined) !== (args.secret_key === undefined)) {
      throw new ToolInputError('Pass both `access_key` and `secret_key`, or neither (e.g. with `assume_role`).');
    }
    if (args.provider === 'custom' && args.endpoint === undefined) throw new ToolInputError('A custom (S3-compatible) provider needs an `endpoint`.');
    if (args.assume_role && args.provider !== 's3') throw new ToolInputError('`assume_role` is only available for Amazon S3 (provider "s3").');
    const response = await client.post<SingleDocument>(storageProvidersPath(organization(args.organization)), {
      body: {
        name: args.name,
        provider: args.provider,
        region: args.region,
        bucket: args.bucket,
        directory: args.directory,
        endpoint: args.endpoint,
        access_key: args.access_key,
        secret_key: args.secret_key,
        assume_role: args.assume_role,
      },
      signal,
    });
    const provider = formatStorageProvider(flattenSingle(response.data));
    return {
      structured: { storage_provider: provider },
      summary: `Created storage provider ${provider.name} (ID ${provider.id}). Use it with forge_create_backup_configuration.`,
    };
  },
});
