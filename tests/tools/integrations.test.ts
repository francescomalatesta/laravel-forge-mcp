import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, textOf } from '../helpers/harness.js';
import { specResponse } from '../helpers/spec-fixtures.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

const SITE = '/api/orgs/acme/servers/3/sites/7';
const env = { FORGE_TOOLSETS: 'core,integrations' };
const paths = () => harness!.requests.map((r) => `${r.method} ${r.url.pathname}`);

const show = (segment: string, attributes: Record<string, unknown>) => ({
  body: specResponse(`organizations.servers.sites.integrations.${segment}.show`, 200, { data: { attributes } }),
});
const horizon = (enabled: string) => show('horizon', { enabled, horizon_installed: true });
const maintenance = (enabled: boolean, status: string | null = null) =>
  show('laravel-maintenance', { enabled, status, laravel_installed: true });

describe('site integrations', () => {
  it('forge_get_site_integrations reads every integration', async () => {
    harness = await createHarness({
      env,
      responses: [
        horizon('true'),
        show('octane', { enabled: 'false', octane_installed: false, port: null }),
        show('reverb', { enabled: 'false', reverb_installed: false, host: null, port: null, connections: null }),
        show('pulse', { enabled: 'false', pulse_installed: true }),
        show('inertia', { enabled: 'false', inertia_installed: false }),
        show('laravel-scheduler', { enabled: true, laravel_installed: true }),
        maintenance(false),
      ],
    });
    const result = await harness.call('forge_get_site_integrations', { server: 3, site: 7 });
    expect(new Set(paths())).toEqual(
      new Set(
        ['horizon', 'octane', 'reverb', 'pulse', 'inertia', 'laravel-scheduler', 'laravel-maintenance'].map(
          (segment) => `GET ${SITE}/integrations/${segment}`,
        ),
      ),
    );
    expect(result.structuredContent).toMatchObject({
      integrations: expect.arrayContaining([
        expect.objectContaining({ integration: 'horizon', enabled: true, package_installed: true }),
        expect.objectContaining({ integration: 'scheduler', enabled: true }),
        expect.objectContaining({ integration: 'maintenance', enabled: false }),
      ]),
    });
    expect(textOf(result)).toMatch(/^Enabled integrations: horizon, scheduler\./);
  });

  it('keeps unknown enabled values as the status', async () => {
    harness = await createHarness({ env, responses: [horizon('installing')] });
    const result = await harness.call('forge_get_site_integrations', { server: 3, site: 7, integration: 'horizon' });
    expect(result.structuredContent).toMatchObject({ integrations: [{ integration: 'horizon', enabled: null, status: 'installing' }] });
  });

  it('forge_enable_site_integration enables maintenance mode and waits', async () => {
    harness = await createHarness({
      env,
      responses: [{ status: 202 }, maintenance(true, 'enabling'), maintenance(true)],
    });
    const result = await harness.call('forge_enable_site_integration', {
      server: 3,
      site: 7,
      integration: 'maintenance',
      maintenance_secret: 'let-me-in',
    });
    expect(harness.requests[0]).toMatchObject({ method: 'POST', body: { status: 503, secret: 'let-me-in' } });
    expect(paths()).toEqual([
      `POST ${SITE}/integrations/laravel-maintenance`,
      `GET ${SITE}/integrations/laravel-maintenance`,
      `GET ${SITE}/integrations/laravel-maintenance`,
    ]);
    expect(result.structuredContent).toMatchObject({ status: 'completed', integration: { integration: 'maintenance', enabled: true } });
  });

  it('forge_enable_site_integration sends Octane settings', async () => {
    harness = await createHarness({
      env,
      responses: [{ status: 202 }, show('octane', { enabled: 'true', octane_installed: true, port: 8000 })],
    });
    const result = await harness.call('forge_enable_site_integration', { server: 3, site: 7, integration: 'octane', octane_server: 'frankenphp', port: 8000 });
    expect(harness.requests[0]?.body).toEqual({ server: 'frankenphp', port: '8000' });
    expect(result.structuredContent).toMatchObject({ status: 'completed', integration: { settings: { port: 8000 } } });
  });

  it('forge_enable_site_integration sends no body for Horizon', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }] });
    const result = await harness.call('forge_enable_site_integration', { server: 3, site: 7, integration: 'horizon', wait: false });
    expect(harness.requests[0]).toMatchObject({ method: 'POST' });
    expect(harness.requests[0]?.body).toBeUndefined();
    expect(result.structuredContent).toEqual({ status: 'queued', check_with: 'forge_get_site_integrations', integration: null });
  });

  it.each([
    [{ integration: 'octane', port: 8000 }, 'Octane needs'],
    [{ integration: 'reverb', host: 'ws.example.com', port: 8080 }, 'Reverb needs'],
    [{ integration: 'horizon', port: 8000 }, '`port` not used by horizon'],
    [{ integration: 'octane', octane_server: 'swoole', port: 8000, maintenance_secret: 'x' }, '`maintenance_secret` not used by octane'],
  ])('forge_enable_site_integration validates %o', async (input, message) => {
    harness = await createHarness({ env });
    const result = await harness.call('forge_enable_site_integration', { server: 3, site: 7, ...input });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(message);
  });

  it('forge_disable_site_integration waits until Horizon is disabled', async () => {
    harness = await createHarness({ env, responses: [{ status: 202 }, horizon('true'), horizon('false')] });
    const result = await harness.call('forge_disable_site_integration', { server: 3, site: 7, integration: 'horizon' });
    expect(paths()).toEqual([`DELETE ${SITE}/integrations/horizon`, `GET ${SITE}/integrations/horizon`, `GET ${SITE}/integrations/horizon`]);
    expect(result.structuredContent).toMatchObject({ status: 'completed', integration: { enabled: false } });
  });

  it('forge_disable_site_integration does not offer Inertia', async () => {
    harness = await createHarness({ env });
    const result = await harness.call('forge_disable_site_integration', { server: 3, site: 7, integration: 'inertia' });
    expect(result.isError).toBe(true);
  });
});
