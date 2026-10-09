import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, textOf } from '../helpers/harness.js';
import { specResponse, specSchema } from '../helpers/spec-fixtures.js';
import { REDACTED } from '../../src/tools/shared/secrets.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

const SERVER = '/api/orgs/acme/servers/3';
const HEARTBEATS = `${SERVER}/sites/7/heartbeats`;
const MONITORS = `${SERVER}/monitors`;
const env = { FORGE_TOOLSETS: 'core,monitoring' };
const PING = 'https://forge.laravel.com/api/heartbeat/secret-token';
const paths = () => harness!.requests.map((r) => `${r.method} ${r.url.pathname}`);

const heartbeat = (attributes: Record<string, unknown> = {}) =>
  specSchema('HeartbeatResource', {
    id: '5',
    attributes: { name: 'Nightly', status: 'beating', frequency: 1440, custom_frequency: null, grace_period: 5, ping_url: PING, ...attributes },
  });

describe('heartbeats', () => {
  it('forge_list_heartbeats hides ping URLs and flags missing heartbeats', async () => {
    harness = await createHarness({
      env,
      responses: [{ body: specResponse('organizations.servers.sites.heartbeats.index', 200, { data: [heartbeat({ status: 'missing' })] }) }],
    });
    const result = await harness.call('forge_list_heartbeats', { server: 3, site: 7 });
    expect(result.structuredContent).toMatchObject({ heartbeats: [{ id: '5', status: 'missing', ping_url: REDACTED }] });
    expect(textOf(result)).toMatch(/missing: Nightly/);
    expect(JSON.stringify(result)).not.toContain(PING);
  });

  it('forge_create_heartbeat maps a cron schedule to a custom frequency', async () => {
    harness = await createHarness({
      env: { ...env, FORGE_ALLOW_SECRETS: 'true' },
      responses: [{ body: specResponse('organizations.servers.sites.heartbeats.store', 200, { data: heartbeat({ frequency: -1, custom_frequency: '0 3 * * *' }) }) }],
    });
    const result = await harness.call('forge_create_heartbeat', { server: 3, site: 7, name: 'Nightly', cron: '0 3 * * *' });
    expect(harness.requests[0]).toMatchObject({ method: 'POST', body: { name: 'Nightly', grace_period: 5, frequency: -1, custom_frequency: '0 3 * * *' } });
    expect(textOf(result)).toContain(PING);
  });

  it('forge_create_heartbeat needs exactly one of frequency and cron', async () => {
    harness = await createHarness({ env });
    const result = await harness.call('forge_create_heartbeat', { server: 3, site: 7, name: 'x', frequency: 60, cron: '* * * * *' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('either `frequency` or `cron`');
  });

  it('forge_update_heartbeat keeps the current schedule', async () => {
    harness = await createHarness({
      env,
      responses: [
        { body: specResponse('organizations.servers.sites.heartbeats.show', 200, { data: heartbeat() }) },
        { body: specResponse('organizations.servers.sites.heartbeats.update', 200, { data: heartbeat({ grace_period: 30 }) }) },
      ],
    });
    const result = await harness.call('forge_update_heartbeat', { server: 3, site: 7, heartbeat: 5, grace_period: 30 });
    expect(harness.requests[1]).toMatchObject({ method: 'PUT', body: { name: 'Nightly', grace_period: 30, frequency: 1440 } });
    expect(result.structuredContent).toMatchObject({ heartbeat: { grace_period: 30 } });
  });

  it('forge_delete_heartbeat deletes it', async () => {
    harness = await createHarness({ env, responses: [{ status: 204 }] });
    await harness.call('forge_delete_heartbeat', { server: 3, site: 7, heartbeat: 5 });
    expect(paths()).toEqual([`DELETE ${HEARTBEATS}/5`]);
  });
});

describe('monitors', () => {
  const monitor = (status: string, state = 'OK') =>
    specSchema('MonitorResource', { id: '4', attributes: { type: 'disk', operator: 'gte', threshold: 80, status, state } });
  const show = (status: string) => ({ body: specResponse('organizations.servers.monitors.show', 200, { data: monitor(status) }) });

  it('forge_list_monitors flags alerts', async () => {
    harness = await createHarness({
      env,
      responses: [{ body: specResponse('organizations.servers.monitors.index', 200, { data: [monitor('installed', 'ALERT')] }) }],
    });
    const result = await harness.call('forge_list_monitors', { server: 3 });
    expect(textOf(result)).toMatch(/in ALERT: disk gte 80 \(4\)/);
  });

  it('forge_create_monitor waits until installed', async () => {
    harness = await createHarness({
      env,
      responses: [{ status: 202, body: specResponse('organizations.servers.monitors.store', 202, { data: monitor('installing') }) }, show('installed')],
    });
    const result = await harness.call('forge_create_monitor', { server: 3, type: 'disk', threshold: 80, notify: 'ops@example.com' });
    expect(harness.requests[0]).toMatchObject({ method: 'POST', body: { type: 'disk', operator: 'gte', threshold: 80, notify: 'ops@example.com' } });
    expect(paths()).toEqual([`POST ${MONITORS}`, `GET ${MONITORS}/4`]);
    expect(result.structuredContent).toMatchObject({ status: 'completed', monitor: { id: '4', status: 'installed' } });
  });

  it('forge_create_monitor reports a failed installation', async () => {
    harness = await createHarness({
      env,
      responses: [{ status: 202, body: specResponse('organizations.servers.monitors.store', 202, { data: monitor('installing') }) }, show('failed-runner')],
    });
    const result = await harness.call('forge_create_monitor', { server: 3, type: 'cpu_load', threshold: 4, notify: 'ops@example.com' });
    expect(result.structuredContent).toMatchObject({ status: 'failed' });
  });

  it('forge_delete_monitor waits until it is gone', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }, { status: 404, body: { message: 'Not found.' } }] });
    const result = await harness.call('forge_delete_monitor', { server: 3, monitor: 4 });
    expect(paths()).toEqual([`DELETE ${MONITORS}/4`, `GET ${MONITORS}/4`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_monitors' });
  });
});
