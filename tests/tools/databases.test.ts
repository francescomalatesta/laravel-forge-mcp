import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, textOf } from '../helpers/harness.js';
import { specResponse, specSchema } from '../helpers/spec-fixtures.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

const SERVER = '/api/orgs/acme/servers/3';
const SCHEMAS = `${SERVER}/database/schemas`;
const USERS = `${SERVER}/database/users`;
const env = { FORGE_TOOLSETS: 'core,databases' };
const SECRET = 'super-secret-pass';

const paths = () => harness!.requests.map((r) => `${r.method} ${r.url.pathname}`);
const database = (id: string, name: string, status = 'installed') => specSchema('DatabaseResource', { id, attributes: { name, status } });
const user = (id: string, name: string, status = 'installed') => specSchema('DatabaseUserResource', { id, attributes: { name, status } });
const schemaList = (...items: ReturnType<typeof database>[]) => ({
  body: specResponse('organizations.servers.database.schemas.index', 200, { data: items }),
});

describe('databases toolset', () => {
  it('is not enabled by default', async () => {
    harness = await createHarness();
    expect((await harness.client.listTools()).tools.map((tool) => tool.name)).not.toContain('forge_list_databases');
  });
});

describe('database schemas', () => {
  it('forge_list_databases lists or reads one database', async () => {
    harness = await createHarness({
      env,
      responses: [
        schemaList(database('12', 'shop')),
        { body: specResponse('organizations.servers.database.schemas.show', 200, { data: database('12', 'shop') }) },
      ],
    });
    const list = await harness.call('forge_list_databases', { server: 3, name: 'shop' });
    expect(harness.requests[0]?.url.searchParams.get('filter[name]')).toBe('shop');
    expect(list.structuredContent).toMatchObject({ databases: [{ id: '12', name: 'shop', status: 'installed' }] });
    await harness.call('forge_list_databases', { server: 3, database: 12 });
    expect(paths()).toEqual([`GET ${SCHEMAS}`, `GET ${SCHEMAS}/12`]);
  });

  it('forge_create_database creates a database with a user and waits until installed', async () => {
    harness = await createHarness({
      env,
      responses: [
        { status: 202, body: specResponse('organizations.servers.database.schemas.store', 202, { data: database('12', 'shop', 'installing') }) },
        { body: specResponse('organizations.servers.database.schemas.show', 200, { data: database('12', 'shop') }) },
      ],
    });
    const result = await harness.call('forge_create_database', { server: 3, name: 'shop', user: 'shop', password: SECRET });
    expect(harness.requests[0]).toMatchObject({ method: 'POST', body: { name: 'shop', user: 'shop', password: SECRET } });
    expect(paths()).toEqual([`POST ${SCHEMAS}`, `GET ${SCHEMAS}/12`]);
    expect(result.structuredContent).toMatchObject({ status: 'completed', database: { id: '12', status: 'installed' } });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('forge_create_database requires user and password together', async () => {
    harness = await createHarness({ env });
    const result = await harness.call('forge_create_database', { server: 3, name: 'shop', user: 'shop' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('both `user` and `password`');
  });

  it('forge_delete_database waits until the database is gone', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }, { status: 404, body: { message: 'Not found.' } }] });
    const result = await harness.call('forge_delete_database', { server: 3, database: 12 });
    expect(paths()).toEqual([`DELETE ${SCHEMAS}/12`, `GET ${SCHEMAS}/12`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_databases' });
  });

  it('forge_sync_databases queues a synchronization', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }] });
    const result = await harness.call('forge_sync_databases', { server: 3 });
    expect(paths()).toEqual([`POST ${SCHEMAS}/synchronizations`]);
    expect(result.structuredContent).toEqual({ status: 'queued', check_with: 'forge_list_databases' });
  });
});

describe('database users', () => {
  it('forge_list_database_users lists users', async () => {
    harness = await createHarness({
      env,
      responses: [{ body: specResponse('organizations.servers.database.users.index', 200, { data: [user('7', 'shop')] }) }],
    });
    const result = await harness.call('forge_list_database_users', { server: 3 });
    expect(paths()).toEqual([`GET ${USERS}`]);
    expect(result.structuredContent).toMatchObject({ users: [{ id: '7', name: 'shop' }] });
  });

  it('forge_create_database_user resolves database names and waits until installed', async () => {
    harness = await createHarness({
      env,
      responses: [
        schemaList(database('12', 'shop')),
        { status: 202, body: specResponse('organizations.servers.database.users.store', 202, { data: user('7', 'reporting', 'installing') }) },
        { body: specResponse('organizations.servers.database.users.show', 200, { data: user('7', 'reporting') }) },
      ],
    });
    const result = await harness.call('forge_create_database_user', {
      server: 3,
      name: 'reporting',
      password: SECRET,
      databases: ['shop', 15],
      read_only: true,
    });
    expect(harness.requests[0]?.url.searchParams.get('filter[name]')).toBe('shop');
    expect(harness.requests[1]).toMatchObject({
      method: 'POST',
      body: { name: 'reporting', password: SECRET, database_ids: [12, 15], read_only: true },
    });
    expect(result.structuredContent).toMatchObject({ status: 'completed', user: { id: '7', status: 'installed' } });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('reports database names that do not exist before calling Forge', async () => {
    harness = await createHarness({ env, responses: [schemaList(database('12', 'shopping'))] });
    const result = await harness.call('forge_create_database_user', { server: 3, name: 'x', password: SECRET, databases: ['shop'] });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Database(s) not found on server 3: shop');
    expect(paths()).toEqual([`GET ${SCHEMAS}`]);
  });

  it('forge_update_database_user replaces the access list and cannot verify the result', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }] });
    const result = await harness.call('forge_update_database_user', { server: 3, user: 7, databases: [12], password: SECRET });
    expect(harness.requests[0]).toMatchObject({ method: 'PUT', body: { password: SECRET, database_ids: [12] } });
    expect(harness.requests[0]?.url.pathname).toBe(`${USERS}/7`);
    expect(result.structuredContent).toEqual({ status: 'queued', check_with: 'forge_list_database_users' });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('forge_update_database_user requires a change', async () => {
    harness = await createHarness({ env });
    expect((await harness.call('forge_update_database_user', { server: 3, user: 7 })).isError).toBe(true);
  });

  it('forge_delete_database_user waits until the user is gone', async () => {
    harness = await createHarness({
      env,
      responses: [
        { status: 202 },
        { body: specResponse('organizations.servers.database.users.show', 200, { data: user('7', 'shop', 'removing') }) },
        { status: 404, body: { message: 'Not found.' } },
      ],
    });
    const result = await harness.call('forge_delete_database_user', { server: 3, user: 7 });
    expect(paths()).toEqual([`DELETE ${USERS}/7`, `GET ${USERS}/7`, `GET ${USERS}/7`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_database_users' });
  });

  it('forge_update_database_root_password changes the root password', async () => {
    harness = await createHarness({ env, responses: [{ status: 204 }] });
    const result = await harness.call('forge_update_database_root_password', { server: 3, password: SECRET });
    expect(harness.requests[0]).toMatchObject({ method: 'PUT', body: { password: SECRET } });
    expect(harness.requests[0]?.url.pathname).toBe(`${SERVER}/database/password`);
    expect(result.structuredContent).toEqual({ updated: true });
  });

  it('rejects short passwords before calling Forge', async () => {
    harness = await createHarness({ env });
    const result = await harness.call('forge_update_database_root_password', { server: 3, password: 'short' });
    expect(result.isError).toBe(true);
  });
});
