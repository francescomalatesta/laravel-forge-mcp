import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, textOf } from '../helpers/harness.js';
import { specResponse, specSchema } from '../helpers/spec-fixtures.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

const ORG = '/api/orgs/acme';
const SERVER = `${ORG}/servers/3`;
const env = { FORGE_TOOLSETS: 'core,servers' };

const paths = () => harness!.requests.map((r) => `${r.method} ${r.url.pathname}`);
const server = (id: string, attributes: Record<string, unknown> = {}) =>
  specSchema('ServerResource', { id, attributes: { name: `server-${id}`, ...attributes } });
const archives = (...ids: string[]) => ({
  body: specResponse('organizations.servers.archives.index', 200, { data: ids.map((id) => server(id)) }),
});
const network = (...ids: string[]) => ({
  body: specResponse('organizations.servers.network.show', 200, { data: ids.map((id) => server(id)) }),
});

describe('servers toolset', () => {
  it('is not enabled by default', async () => {
    harness = await createHarness();
    const names = (await harness.client.listTools()).tools.map((tool) => tool.name);
    expect(names).not.toContain('forge_run_service_action');
  });
});

describe('forge_run_service_action', () => {
  it.each([
    [{ service: 'nginx' }, 'nginx', { action: 'reboot' }],
    [{ service: 'mysql', action: 'stop' }, 'mysql', { action: 'stop' }],
    [{ service: 'php', action: 'reload', php_version: 'php83' }, 'php', { action: 'reload', version: 'php83' }],
  ])('%j', async (args, service, body) => {
    harness = await createHarness({ env, responses: [{ status: 202 }] });
    const result = await harness.call('forge_run_service_action', { server: 3, ...args });
    expect(paths()).toEqual([`POST ${SERVER}/services/${service}/actions`]);
    expect(harness.requests[0]?.body).toEqual(body);
    expect(result.structuredContent).toEqual({ status: 'queued', check_with: 'forge_list_server_events' });
  });

  it.each([
    [{ service: 'redis', action: 'stop' }, 'redis supports: reboot'],
    [{ service: 'nginx', action: 'reload' }, 'nginx supports: reboot, stop'],
    [{ service: 'php' }, 'Pass `php_version`'],
  ])('rejects %j', async (args, message) => {
    harness = await createHarness({ env });
    const result = await harness.call('forge_run_service_action', { server: 3, ...args });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(message);
  });
});

describe('forge_run_server_action', () => {
  it('reboots the server', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }] });
    const result = await harness.call('forge_run_server_action', { server: 3, action: 'reboot' });
    expect(paths()).toEqual([`POST ${SERVER}/actions`]);
    expect(harness.requests[0]?.body).toEqual({ action: 'reboot' });
    expect(result.structuredContent).toEqual({ status: 'queued', check_with: 'forge_list_server_events' });
  });
});

describe('server logs', () => {
  const log = (content: string) => ({ body: specResponse('organizations.servers.logs.show', 200, { data: { attributes: { content } } }) });

  it('forge_get_server_log reads the end of a log by key', async () => {
    harness = await createHarness({ env, responses: [log('a\nb\nc')] });
    const result = await harness.call('forge_get_server_log', { server: 3, key: 'nginx-error', lines: 1 });
    expect(paths()).toEqual([`GET ${SERVER}/logs/nginx-error`]);
    expect(result.structuredContent).toEqual({ key: 'nginx-error', content: 'c', truncated: true, total_lines: 3 });
  });

  it('forge_clear_server_log waits until the log is empty', async () => {
    harness = await createHarness({ env, responses: [{ status: 204 }, log('')] });
    const result = await harness.call('forge_clear_server_log', { server: 3, key: 'php' });
    expect(paths()).toEqual([`DELETE ${SERVER}/logs/php`, `GET ${SERVER}/logs/php`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_get_server_log' });
  });
});

describe('forge_update_server', () => {
  it('sends only the given fields', async () => {
    harness = await createHarness({
      env,
      responses: [{ body: specResponse('organizations.servers.update', 200, { data: server('3', { name: 'web-renamed' }) }) }],
    });
    const result = await harness.call('forge_update_server', { server: 3, name: 'web-renamed', timezone: 'Europe/Rome' });
    expect(harness.requests[0]).toMatchObject({ method: 'PUT', body: { name: 'web-renamed', timezone: 'Europe/Rome' } });
    expect(result.structuredContent).toMatchObject({ server: { id: '3', name: 'web-renamed' } });
    expect(textOf(result)).toMatch(/^Server 3 updated: name, timezone\./);
  });

  it('requires at least one field', async () => {
    harness = await createHarness({ env });
    const result = await harness.call('forge_update_server', { server: 3 });
    expect(result.isError).toBe(true);
  });
});

describe('forge_delete_server', () => {
  it('can keep the machine at the provider and waits until the server is gone', async () => {
    harness = await createHarness({
      env,
      responses: [
        { status: 202 },
        { body: specResponse('organizations.servers.show', 200, { data: server('3') }) },
        { status: 404, body: { message: 'Not found.' } },
      ],
    });
    const result = await harness.call('forge_delete_server', { server: 3, preserve_at_provider: true });
    expect(paths()).toEqual([`DELETE ${SERVER}`, `GET ${SERVER}`, `GET ${SERVER}`]);
    expect(harness.requests[0]?.url.searchParams.get('preserve_at_provider')).toBe('true');
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_servers' });
  });
});

describe('archives', () => {
  it('forge_list_archived_servers lists archived servers', async () => {
    harness = await createHarness({ env, responses: [archives('5')] });
    const result = await harness.call('forge_list_archived_servers');
    expect(paths()).toEqual([`GET ${ORG}/servers/archives`]);
    expect(result.structuredContent).toMatchObject({ servers: [{ id: '5' }] });
  });

  it('forge_archive_server waits until the server is archived', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }, archives('5'), archives('5', '3')] });
    const result = await harness.call('forge_archive_server', { server: '3' });
    expect(harness.requests[0]).toMatchObject({ method: 'POST', body: { server_id: 3 } });
    expect(paths()).toEqual([`POST ${ORG}/servers/archives`, `GET ${ORG}/servers/archives`, `GET ${ORG}/servers/archives`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_archived_servers' });
  });

  it('forge_unarchive_server waits until the server leaves the archive', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }, archives('3'), archives()] });
    const result = await harness.call('forge_unarchive_server', { server: 3 });
    expect(paths()[0]).toBe(`DELETE ${ORG}/servers/archives/3`);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_servers' });
  });
});

describe('network', () => {
  it('reads the network and replaces it, waiting until it matches', async () => {
    harness = await createHarness({ env, responses: [network('4'), { status: 202 }, network('4'), network('5', '4')] });
    const current = await harness.call('forge_get_server_network', { server: 3 });
    expect(current.structuredContent).toMatchObject({ servers: [{ id: '4' }] });

    const result = await harness.call('forge_update_server_network', { server: 3, servers: [4, 5] });
    expect(harness.requests[1]).toMatchObject({ method: 'PUT', body: { servers: [4, 5] } });
    expect(paths()).toEqual([`GET ${SERVER}/network`, `PUT ${SERVER}/network`, `GET ${SERVER}/network`, `GET ${SERVER}/network`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_get_server_network' });
  });
});
