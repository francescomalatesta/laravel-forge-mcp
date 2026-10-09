import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, textOf } from '../helpers/harness.js';
import { specResponse, specSchema } from '../helpers/spec-fixtures.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

const SERVER = '/api/orgs/acme/servers/3';
const CONFIGS = `${SERVER}/database/backups`;
const BACKUPS = `${CONFIGS}/5/instances`;
const SCHEMAS = `${SERVER}/database/schemas`;
const STORAGE = '/api/orgs/acme/storage-providers';
const env = { FORGE_TOOLSETS: 'core,databases' };

const paths = () => harness!.requests.map((r) => `${r.method} ${r.url.pathname}`);

const configuration = (id: string, attributes: Record<string, unknown> = {}) =>
  specSchema('BackupConfigurationResource', {
    id,
    attributes: {
      name: 'nightly',
      status: 'installed',
      storage_provider_id: 2,
      schedule: 'daily',
      displayable_schedule: 'Daily at 03:00',
      time: '03:00',
      day_of_week: null,
      cron_schedule: null,
      database_ids: [12],
      include_new_databases: false,
      retention: 7,
      notify_email: null,
      ...attributes,
    },
  });
const configurationList = (...items: ReturnType<typeof configuration>[]) => ({
  body: specResponse('organizations.servers.database.backups.index', 200, { data: items }),
});
const showConfiguration = (item: ReturnType<typeof configuration>) => ({
  body: specResponse('organizations.servers.database.backups.show', 200, { data: item }),
});

const backup = (id: string, status: string) => specSchema('BackupResource', { id, attributes: { status } });
const backupList = (...items: ReturnType<typeof backup>[]) => ({
  body: specResponse('organizations.servers.database.backups.instances.index', 200, { data: items }),
});
const schemaList = (id: string, name: string) => ({
  body: specResponse('organizations.servers.database.schemas.index', 200, {
    data: [specSchema('DatabaseResource', { id, attributes: { name } })],
  }),
});

describe('backup configurations', () => {
  it('belong to the databases toolset', async () => {
    harness = await createHarness({ env });
    const names = (await harness.client.listTools()).tools.map((tool) => tool.name);
    expect(names).toContain('forge_restore_backup');
    expect(names).not.toContain('forge_list_storage_providers');
  });

  it('forge_list_backup_configurations lists or reads one configuration', async () => {
    harness = await createHarness({ env, responses: [configurationList(configuration('5')), showConfiguration(configuration('5'))] });
    const list = await harness.call('forge_list_backup_configurations', { server: 3, name: 'nightly' });
    expect(harness.requests[0]?.url.searchParams.get('filter[name]')).toBe('nightly');
    expect(list.structuredContent).toMatchObject({ backup_configurations: [{ id: '5', name: 'nightly', retention: 7 }] });
    await harness.call('forge_list_backup_configurations', { server: 3, backup_configuration: 5 });
    expect(paths()).toEqual([`GET ${CONFIGS}`, `GET ${CONFIGS}/5`]);
  });

  it('forge_create_backup_configuration resolves names, creates and waits for the new configuration', async () => {
    harness = await createHarness({
      env,
      responses: [
        {
          body: specResponse('organizations.storage-providers.index', 200, {
            data: [specSchema('StorageProviderResource', { id: '2', attributes: { name: 'S3 backups' } })],
          }),
        },
        schemaList('12', 'shop'),
        configurationList(configuration('4', { name: 'old' })),
        { status: 202 },
        configurationList(configuration('5', { status: 'installing' }), configuration('4', { name: 'old' })),
        configurationList(configuration('5'), configuration('4', { name: 'old' })),
      ],
    });
    const result = await harness.call('forge_create_backup_configuration', {
      server: 3,
      storage_provider: 'S3 backups',
      databases: ['shop'],
      retention: 7,
      frequency: 'weekly',
      day: 1,
      time: '03:30',
      name: 'nightly',
    });
    expect(paths()).toEqual([`GET ${STORAGE}`, `GET ${SCHEMAS}`, `GET ${CONFIGS}`, `POST ${CONFIGS}`, `GET ${CONFIGS}`, `GET ${CONFIGS}`]);
    expect(harness.requests[3]?.body).toEqual({
      storage_provider_id: 2,
      name: 'nightly',
      frequency: 'weekly',
      day: '1',
      time: '03:30',
      database_ids: [12],
      retention: 7,
    });
    expect(result.structuredContent).toMatchObject({ status: 'completed', backup_configuration: { id: '5', status: 'installed' } });
  });

  it('forge_create_backup_configuration returns right away with wait false', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }] });
    const result = await harness.call('forge_create_backup_configuration', {
      server: 3,
      storage_provider: 2,
      databases: [12],
      retention: 3,
      frequency: 'custom',
      cron: '0 */6 * * *',
      wait: false,
    });
    expect(harness.requests[0]?.body).toMatchObject({ frequency: 'custom', cron: '0 */6 * * *', database_ids: [12] });
    expect(result.structuredContent).toEqual({ status: 'queued', check_with: 'forge_list_backup_configurations', backup_configuration: null });
  });

  it.each([
    [{ frequency: 'custom' }, 'needs a `cron`'],
    [{ frequency: 'daily', cron: '* * * * *' }, '`cron` is only used'],
    [{ frequency: 'daily', day: 2 }, '`day` is only used'],
    [{ frequency: 'hourly', time: '01:00' }, '`time` is only used'],
  ])('validates the schedule %o before calling Forge', async (schedule, message) => {
    harness = await createHarness({ env });
    const result = await harness.call('forge_create_backup_configuration', { server: 3, storage_provider: 2, databases: [12], retention: 3, ...schedule });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(message);
  });

  it('forge_update_backup_configuration keeps current values and waits for the change', async () => {
    harness = await createHarness({
      env,
      responses: [showConfiguration(configuration('5')), { status: 202 }, showConfiguration(configuration('5', { retention: 14 }))],
    });
    const result = await harness.call('forge_update_backup_configuration', { server: 3, backup_configuration: 5, retention: 14 });
    expect(paths()).toEqual([`GET ${CONFIGS}/5`, `PUT ${CONFIGS}/5`, `GET ${CONFIGS}/5`]);
    expect(harness.requests[1]?.body).toMatchObject({
      storage_provider_id: 2,
      name: 'nightly',
      frequency: 'daily',
      time: '03:00',
      database_ids: [12],
      include_new_databases: false,
      retention: 14,
      notification_email: null,
    });
    expect(result.structuredContent).toMatchObject({ status: 'completed', backup_configuration: { retention: 14 } });
  });

  it('forge_update_backup_configuration cannot verify schedule changes', async () => {
    harness = await createHarness({ env, responses: [showConfiguration(configuration('5')), { status: 202 }] });
    const result = await harness.call('forge_update_backup_configuration', { server: 3, backup_configuration: 5, time: '04:00' });
    expect(harness.requests[1]?.body).toMatchObject({ frequency: 'daily', time: '04:00' });
    expect(result.structuredContent).toEqual({ status: 'queued', check_with: 'forge_list_backup_configurations', backup_configuration: null });
  });

  it('forge_update_backup_configuration requires a change', async () => {
    harness = await createHarness({ env });
    expect((await harness.call('forge_update_backup_configuration', { server: 3, backup_configuration: 5 })).isError).toBe(true);
  });

  it('forge_delete_backup_configuration waits until it is gone', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }, { status: 404, body: { message: 'Not found.' } }] });
    const result = await harness.call('forge_delete_backup_configuration', { server: 3, backup_configuration: 5 });
    expect(paths()).toEqual([`DELETE ${CONFIGS}/5`, `GET ${CONFIGS}/5`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_backup_configurations' });
  });
});

describe('backups', () => {
  it('forge_list_backups lists newest first or reads one backup', async () => {
    harness = await createHarness({
      env,
      responses: [
        backupList(backup('9', 'finished')),
        { body: specResponse('organizations.servers.database.backups.instances.show', 200, { data: backup('9', 'finished') }) },
      ],
    });
    const list = await harness.call('forge_list_backups', { server: 3, backup_configuration: 5 });
    expect(harness.requests[0]?.url.searchParams.get('sort')).toBe('-created_at');
    expect(list.structuredContent).toMatchObject({ backups: [{ id: '9', status: 'finished' }] });
    await harness.call('forge_list_backups', { server: 3, backup_configuration: 5, backup: 9 });
    expect(paths()).toEqual([`GET ${BACKUPS}`, `GET ${BACKUPS}/9`]);
  });

  it('forge_create_backup runs a backup and waits until it finishes', async () => {
    harness = await createHarness({
      env,
      responses: [
        backupList(backup('9', 'finished')),
        { status: 202 },
        backupList(backup('9', 'finished')),
        backupList(backup('10', 'running'), backup('9', 'finished')),
        backupList(backup('10', 'finished'), backup('9', 'finished')),
      ],
    });
    const result = await harness.call('forge_create_backup', { server: 3, backup_configuration: 5 });
    expect(paths()).toEqual([`GET ${BACKUPS}`, `POST ${BACKUPS}`, `GET ${BACKUPS}`, `GET ${BACKUPS}`, `GET ${BACKUPS}`]);
    expect(result.structuredContent).toMatchObject({ status: 'completed', backup: { id: '10', status: 'finished' } });
  });

  it('forge_create_backup reports a failed backup', async () => {
    harness = await createHarness({ env, responses: [backupList(), { status: 202 }, backupList(backup('10', 'failed'))] });
    const result = await harness.call('forge_create_backup', { server: 3, backup_configuration: 5 });
    expect(result.structuredContent).toMatchObject({ status: 'failed', backup: { id: '10' } });
  });

  it('forge_delete_backup waits until it is gone', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }, { status: 404, body: { message: 'Not found.' } }] });
    const result = await harness.call('forge_delete_backup', { server: 3, backup_configuration: 5, backup: 9 });
    expect(paths()).toEqual([`DELETE ${BACKUPS}/9`, `GET ${BACKUPS}/9`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_backups' });
  });

  it('forge_restore_backup resolves the database name and points to server events', async () => {
    harness = await createHarness({ env, responses: [schemaList('12', 'shop'), { status: 202 }] });
    const result = await harness.call('forge_restore_backup', { server: 3, backup_configuration: 5, backup: 9, database: 'shop' });
    expect(paths()).toEqual([`GET ${SCHEMAS}`, `POST ${BACKUPS}/9/restores`]);
    expect(harness.requests[1]?.body).toEqual({ database_id: 12 });
    expect(result.structuredContent).toEqual({ status: 'queued', check_with: 'forge_list_server_events' });
  });
});
