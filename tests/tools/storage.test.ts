import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, textOf } from '../helpers/harness.js';
import { specResponse, specSchema } from '../helpers/spec-fixtures.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

const STORAGE = '/api/orgs/acme/storage-providers';
const env = { FORGE_TOOLSETS: 'core,storage' };
const SECRET = 'very-secret-key';

const paths = () => harness!.requests.map((r) => `${r.method} ${r.url.pathname}`);
const provider = (id: string, attributes: Record<string, unknown> = {}) =>
  specSchema('StorageProviderResource', {
    id,
    attributes: { name: 'S3 backups', provider: 's3', region: 'eu-west-1', bucket: 'backups', directory: null, endpoint: null, assume_role: false, ...attributes },
  });

describe('storage providers', () => {
  it('are not enabled by default', async () => {
    harness = await createHarness();
    expect((await harness.client.listTools()).tools.map((tool) => tool.name)).not.toContain('forge_list_storage_providers');
  });

  it('forge_list_storage_providers lists or reads one provider', async () => {
    harness = await createHarness({
      env,
      responses: [
        { body: specResponse('organizations.storage-providers.index', 200, { data: [provider('2')] }) },
        { body: specResponse('organizations.storage-providers.show', 200, { data: provider('2') }) },
      ],
    });
    const list = await harness.call('forge_list_storage_providers', { provider: 's3' });
    expect(harness.requests[0]?.url.searchParams.get('filter[provider]')).toBe('s3');
    expect(list.structuredContent).toMatchObject({ storage_providers: [{ id: '2', name: 'S3 backups', bucket: 'backups' }] });
    await harness.call('forge_list_storage_providers', { storage_provider: 2 });
    expect(paths()).toEqual([`GET ${STORAGE}`, `GET ${STORAGE}/2`]);
  });

  it('forge_create_storage_provider sends credentials without returning them', async () => {
    harness = await createHarness({
      env,
      responses: [{ status: 201, body: specResponse('organizations.storage-providers.store', 201, { data: provider('2') }) }],
    });
    const result = await harness.call('forge_create_storage_provider', {
      name: 'S3 backups',
      provider: 's3',
      region: 'eu-west-1',
      bucket: 'backups',
      access_key: 'AKIA',
      secret_key: SECRET,
    });
    expect(harness.requests[0]).toMatchObject({
      method: 'POST',
      body: { name: 'S3 backups', provider: 's3', region: 'eu-west-1', bucket: 'backups', access_key: 'AKIA', secret_key: SECRET },
    });
    expect(result.structuredContent).toMatchObject({ storage_provider: { id: '2' } });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it.each([
    [{ provider: 's3', access_key: 'AKIA' }, 'both `access_key` and `secret_key`'],
    [{ provider: 'custom' }, 'needs an `endpoint`'],
    [{ provider: 'spaces', assume_role: true }, 'only available for Amazon S3'],
  ])('forge_create_storage_provider validates %o', async (input, message) => {
    harness = await createHarness({ env });
    const result = await harness.call('forge_create_storage_provider', { name: 'x', ...input });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(message);
  });

  it('forge_update_storage_provider keeps current values and completes from the response', async () => {
    harness = await createHarness({
      env,
      responses: [
        { body: specResponse('organizations.storage-providers.show', 200, { data: provider('2') }) },
        { status: 202, body: specResponse('organizations.storage-providers.update', 202, { data: provider('2', { bucket: 'new-backups' }) }) },
      ],
    });
    const result = await harness.call('forge_update_storage_provider', { storage_provider: 2, bucket: 'new-backups' });
    expect(paths()).toEqual([`GET ${STORAGE}/2`, `PUT ${STORAGE}/2`]);
    expect(harness.requests[1]?.body).toEqual({ name: 'S3 backups', provider: 's3', region: 'eu-west-1', bucket: 'new-backups', assume_role: false });
    expect(result.structuredContent).toMatchObject({ status: 'completed', storage_provider: { bucket: 'new-backups' } });
  });

  it('forge_update_storage_provider cannot verify credential changes', async () => {
    harness = await createHarness({
      env,
      responses: [
        { body: specResponse('organizations.storage-providers.show', 200, { data: provider('2') }) },
        { status: 202, body: specResponse('organizations.storage-providers.update', 202, { data: provider('2') }) },
      ],
    });
    const result = await harness.call('forge_update_storage_provider', { storage_provider: 2, access_key: 'AKIA2', secret_key: SECRET });
    expect(harness.requests[1]?.body).toMatchObject({ access_key: 'AKIA2', secret_key: SECRET });
    expect(result.structuredContent).toMatchObject({ status: 'queued', check_with: 'forge_list_storage_providers' });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('forge_delete_storage_provider deletes it', async () => {
    harness = await createHarness({ env, responses: [{ status: 204 }] });
    const result = await harness.call('forge_delete_storage_provider', { storage_provider: 2 });
    expect(paths()).toEqual([`DELETE ${STORAGE}/2`]);
    expect(result.structuredContent).toEqual({ deleted: true });
  });

  it('forge_delete_storage_provider explains a provider in use', async () => {
    harness = await createHarness({ env, responses: [{ status: 409, body: { message: 'Conflict.' } }] });
    const result = await harness.call('forge_delete_storage_provider', { storage_provider: 2 });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('used by backup configurations');
  });
});
