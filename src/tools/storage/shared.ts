import { z } from 'zod';
import { apiPath } from '../../forge/path.js';
import { idInput, pick } from '../shared/schemas.js';

export function storageProvidersPath(org: string): string {
  return apiPath`/orgs/${org}/storage-providers`;
}

export function storageProviderPath(org: string, provider: string | number): string {
  return `${storageProvidersPath(org)}/${encodeURIComponent(String(provider))}`;
}

export const STORAGE_PROVIDERS = ['s3', 'spaces', 'hetzner', 'ovh', 'scaleway', 'custom'] as const;

export const storageProviderInput = idInput('Storage provider ID. Use forge_list_storage_providers to find it.');

export const STORAGE_PROVIDER_NOT_FOUND_HINT = 'Check the storage provider ID with forge_list_storage_providers.';

const FIELDS = ['id', 'name', 'provider', 'provider_name', 'region', 'bucket', 'directory', 'endpoint', 'assume_role', 'in_use', 'created_at', 'updated_at'] as const;

export const storageProviderOutput = z.looseObject({
  id: z.string(),
  name: z.string().nullable(),
  provider: z.string().nullable().describe('s3, spaces, hetzner, ovh, scaleway or custom (S3 compatible).'),
  provider_name: z.string().nullable(),
  region: z.string().nullable(),
  bucket: z.string().nullable(),
  directory: z.string().nullable(),
  endpoint: z.string().nullable(),
  assume_role: z.boolean().nullable().describe('Uses the EC2 instance role instead of access keys.'),
  in_use: z.boolean().nullable().describe('Used by backup configurations (it cannot be deleted while in use).'),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type StorageProviderOutput = z.output<typeof storageProviderOutput>;

/** Credentials are never part of the resource: nothing to redact. */
export function formatStorageProvider(flat: Record<string, unknown>): StorageProviderOutput {
  return pick(flat, FIELDS) as StorageProviderOutput;
}

/** Location and credential inputs shared by create and update. */
export const storageSettingsInput = {
  region: z.string().min(1).optional().describe('Region, e.g. "eu-west-1" or "fra1".'),
  bucket: z.string().min(1).optional().describe('Bucket name.'),
  directory: z.string().min(1).optional().describe('Directory inside the bucket.'),
  endpoint: z.string().url().optional().describe('Endpoint URL, for S3-compatible providers (e.g. custom).'),
  access_key: z.string().min(1).optional().describe('Access key ID (never returned by any tool).'),
  secret_key: z.string().min(1).optional().describe('Secret access key (never returned by any tool).'),
  assume_role: z.boolean().optional().describe('Amazon S3 only: use the EC2 instance role instead of access keys.'),
};
