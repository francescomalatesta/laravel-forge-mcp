import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, textOf } from '../helpers/harness.js';
import { specResponse, specSchema } from '../helpers/spec-fixtures.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

const SERVER = '/api/orgs/acme/servers/3';
const SITE = `${SERVER}/sites/7`;
const SITE_SHOW = '/api/orgs/acme/sites/7';
const scope = { server: 3, site: 7 };

const site = (attributes: Record<string, unknown>) =>
  specSchema('SiteResource', {
    id: '7',
    attributes: { name: 'example.com', ...attributes },
    relationships: { server: { data: { type: 'servers', id: '3' } } },
  });
const siteShow = (attributes: Record<string, unknown>) => ({ body: specResponse('organizations.sites.show', 200, { data: site(attributes) }) });
const content = (operationId: string, value: string) => ({ body: specResponse(operationId, 200, { data: { attributes: { content: value } } }) });

const paths = () => harness!.requests.map((r) => `${r.method} ${r.url.pathname}`);

describe('forge_create_site', () => {
  const created = (status: string) => ({
    status: 202,
    body: specResponse('organizations.servers.sites.store', 202, { data: site({ status }) }),
  });

  it('creates the site and waits until it is installed', async () => {
    harness = await createHarness({ responses: [created('creating'), siteShow({ status: 'installing' }), siteShow({ status: 'installed' })] });

    const result = await harness.call('forge_create_site', {
      server: 3,
      name: 'example.com',
      php_version: 'php83',
      repository: 'acme/app',
      branch: 'main',
    });

    expect(paths()).toEqual([`POST ${SERVER}/sites`, `GET ${SITE_SHOW}`, `GET ${SITE_SHOW}`]);
    expect(harness.requests[0]?.body).toEqual({ name: 'example.com', type: 'laravel', php_version: 'php83', repository: 'acme/app', branch: 'main' });
    expect(result.structuredContent).toMatchObject({
      status: 'completed',
      check_with: 'forge_get_site',
      site: { id: '7', status: 'installed', server_id: '3' },
    });
    expect(textOf(result)).toContain('deploy it with forge_deploy_site');
  });

  it('reports a failed installation', async () => {
    harness = await createHarness({ responses: [created('creating'), siteShow({ status: 'failed' })] });
    const result = await harness.call('forge_create_site', { server: 3, name: 'example.com' });
    expect(result.structuredContent).toMatchObject({ status: 'failed', site: { status: 'failed' } });
  });

  it('returns right away with wait=false', async () => {
    harness = await createHarness({ responses: [created('creating')] });
    const result = await harness.call('forge_create_site', { server: 3, name: 'example.com', wait: false });
    expect(result.structuredContent).toMatchObject({ status: 'queued', site: { id: '7', status: 'creating' } });
  });
});

describe('forge_create_balanced_site', () => {
  it('sends the balancing nodes', async () => {
    harness = await createHarness({
      responses: [{ status: 202, body: specResponse('organizations.servers.sites.storeOnBalancer', 202, { data: site({ status: 'installed' }) }) }],
    });
    const result = await harness.call('forge_create_balanced_site', {
      server: 3,
      domain: 'example.com',
      balancer_method: 'least_conn',
      balancing: [{ server_id: 10, port: 80 }, { server_id: 11, weight: 2 }],
    });
    expect(paths()).toEqual([`POST ${SERVER}/sites/balancer`]);
    expect(harness.requests[0]?.body).toEqual({
      domain: 'example.com',
      balancer_method: 'least_conn',
      balancing: [{ server_id: 10, port: 80 }, { server_id: 11, weight: 2 }],
    });
    // Already installed in the response: no poll needed.
    expect(result.structuredContent).toMatchObject({ status: 'completed' });
  });
});

describe('forge_update_site', () => {
  it('waits until the site reflects the new settings', async () => {
    harness = await createHarness({
      responses: [
        { status: 202 },
        siteShow({ web_directory: '/public', quick_deploy: false }),
        siteShow({ web_directory: '/public/app', quick_deploy: true }),
      ],
    });
    const result = await harness.call('forge_update_site', { ...scope, directory: '/public/app', push_to_deploy: true });

    expect(harness.requests[0]).toMatchObject({ method: 'PUT', body: { directory: '/public/app', push_to_deploy: true } });
    expect(paths()).toEqual([`PUT ${SITE}`, `GET ${SITE_SHOW}`, `GET ${SITE_SHOW}`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_get_site' });
  });

  it('does not wait for settings the site does not report', async () => {
    harness = await createHarness({ responses: [{ status: 202 }] });
    const result = await harness.call('forge_update_site', { ...scope, php_version: 'php84' });
    expect(result.structuredContent).toEqual({ status: 'queued', check_with: 'forge_get_site' });
    expect(textOf(result)).toContain('does not report PHP version');
  });

  it('requires at least one setting', async () => {
    harness = await createHarness();
    const result = await harness.call('forge_update_site', scope);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Nothing to update');
  });
});

describe('forge_update_site_repository', () => {
  it('waits until the new repository is installed on the requested branch', async () => {
    const repository = (status: string, branch: string) => ({ provider: 'github', url: 'git@github.com:acme/app.git', branch, status });
    harness = await createHarness({
      responses: [
        { status: 202, body: specResponse('organizations.servers.sites.git.update', 202, { data: site({ repository: repository('installing', 'develop') }) }) },
        siteShow({ repository: repository('installed', 'develop') }),
      ],
    });
    const result = await harness.call('forge_update_site_repository', {
      ...scope,
      source_control_provider: 'github',
      repository: 'acme/app',
      branch: 'develop',
    });
    expect(harness.requests[0]).toMatchObject({
      method: 'PUT',
      body: { source_control_provider: 'github', repository: 'acme/app', branch: 'develop' },
    });
    expect(paths()).toEqual([`PUT ${SITE}/git`, `GET ${SITE_SHOW}`]);
    expect(result.structuredContent).toMatchObject({ status: 'completed', site: { repository_branch: 'develop' } });
  });
});

describe('forge_delete_site', () => {
  it('waits until the site is gone', async () => {
    harness = await createHarness({
      responses: [{ status: 202 }, siteShow({ status: 'removing' }), { status: 404, body: { message: 'Not found.' } }],
    });
    const result = await harness.call('forge_delete_site', scope);
    expect(paths()).toEqual([`DELETE ${SITE}`, `GET ${SITE_SHOW}`, `GET ${SITE_SHOW}`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_sites' });
  });
});

describe('.env tools', () => {
  const ENV_SHOW = 'organizations.servers.sites.environment.show';

  it('forge_set_site_env_vars patches the file without returning values', async () => {
    const before = 'APP_ENV=production\nAPP_DEBUG=true\nDB_PASSWORD=s3cret\n';
    const after = 'APP_ENV=production\nAPP_DEBUG=false\nDB_PASSWORD=s3cret\nNEW_KEY=1\n';
    harness = await createHarness({ responses: [content(ENV_SHOW, before), { status: 202 }, content(ENV_SHOW, after)] });

    const result = await harness.call('forge_set_site_env_vars', { ...scope, set: { APP_DEBUG: 'false', NEW_KEY: '1' }, queues: true });

    expect(paths()).toEqual([`GET ${SITE}/environment`, `PUT ${SITE}/environment`, `GET ${SITE}/environment`]);
    expect(harness.requests[1]?.body).toEqual({ environment: after, queues: true });
    expect(result.structuredContent).toEqual({
      status: 'completed',
      check_with: 'forge_get_site_environment',
      updated: ['APP_DEBUG'],
      added: ['NEW_KEY'],
      removed: [],
      not_found: [],
    });
    expect(textOf(result)).not.toContain('s3cret');
  });

  it('forge_set_site_env_vars skips the write when nothing changes', async () => {
    harness = await createHarness({ responses: [content(ENV_SHOW, 'A=1\n')] });
    const result = await harness.call('forge_set_site_env_vars', { ...scope, unset: ['MISSING'] });
    expect(paths()).toEqual([`GET ${SITE}/environment`]);
    expect(result.structuredContent).toMatchObject({ status: 'completed', not_found: ['MISSING'] });
  });

  it.each([
    [{}, 'Nothing to change'],
    [{ set: { A: '1' }, unset: ['A'] }, 'both set and unset'],
  ])('forge_set_site_env_vars rejects %j', async (args, message) => {
    harness = await createHarness();
    const result = await harness.call('forge_set_site_env_vars', { ...scope, ...args });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(message);
  });

  it('reading or replacing the whole file requires FORGE_ALLOW_SECRETS', async () => {
    harness = await createHarness();
    const names = (await harness.client.listTools()).tools.map((tool) => tool.name);
    expect(names).toContain('forge_set_site_env_vars');
    expect(names).not.toContain('forge_get_site_environment');
    expect(names).not.toContain('forge_update_site_environment');
  });

  it('forge_get_site_environment and forge_update_site_environment work when secrets are allowed', async () => {
    harness = await createHarness({
      env: { FORGE_ALLOW_SECRETS: 'true' },
      responses: [content(ENV_SHOW, 'A=1\n'), { status: 202 }, content(ENV_SHOW, 'A=2\n')],
    });
    expect((await harness.call('forge_get_site_environment', scope)).structuredContent).toEqual({ content: 'A=1\n' });
    const updated = await harness.call('forge_update_site_environment', { ...scope, content: 'A=2' });
    expect(harness.requests[1]?.body).toEqual({ environment: 'A=2' });
    expect(updated.structuredContent).toEqual({ status: 'completed', check_with: 'forge_get_site_environment' });
  });
});

describe('Nginx configuration', () => {
  const NGINX_SHOW = 'organizations.servers.sites.nginx.show';

  it('reads and replaces the configuration, waiting until it is applied', async () => {
    harness = await createHarness({
      responses: [content(NGINX_SHOW, 'server { listen 80; }'), { status: 202 }, content(NGINX_SHOW, 'server { listen 81; }\n')],
    });
    expect((await harness.call('forge_get_site_nginx_config', scope)).structuredContent).toEqual({ content: 'server { listen 80; }' });
    const result = await harness.call('forge_update_site_nginx_config', { ...scope, config: 'server { listen 81; }' });

    expect(paths()).toEqual([`GET ${SITE}/nginx`, `PUT ${SITE}/nginx`, `GET ${SITE}/nginx`]);
    expect(harness.requests[1]?.body).toEqual({ config: 'server { listen 81; }' });
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_get_site_nginx_config' });
  });
});

describe('site logs', () => {
  it('forge_get_site_log reads the requested log and keeps the last lines', async () => {
    harness = await createHarness({ responses: [content('organizations.servers.sites.logs.nginx-error.show', 'e1\ne2\ne3')] });
    const result = await harness.call('forge_get_site_log', { ...scope, log: 'nginx-error', lines: 2 });
    expect(paths()).toEqual([`GET ${SITE}/logs/nginx-error`]);
    expect(result.structuredContent).toEqual({ log: 'nginx-error', content: 'e2\ne3', truncated: true, total_lines: 3 });
  });

  it('forge_clear_site_log empties the application log by default', async () => {
    const LOG = 'organizations.servers.sites.logs.application.show';
    harness = await createHarness({ responses: [{ status: 202 }, content(LOG, 'old line'), content(LOG, '')] });
    const result = await harness.call('forge_clear_site_log', scope);
    expect(paths()).toEqual([`DELETE ${SITE}/logs/application`, `GET ${SITE}/logs/application`, `GET ${SITE}/logs/application`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_get_site_log' });
  });
});

describe('healthcheck', () => {
  it('reads, sets and removes the healthcheck endpoint', async () => {
    harness = await createHarness({
      responses: [
        { body: specResponse('organizations.servers.sites.healthcheck.show', 200, { data: { attributes: { healthcheck_endpoint: null } } }) },
        { status: 204 },
        { status: 204 },
      ],
    });
    expect((await harness.call('forge_get_site_healthcheck', scope)).structuredContent).toEqual({ healthcheck_endpoint: null });
    await harness.call('forge_update_site_healthcheck', { ...scope, healthcheck_endpoint: 'https://example.com/up' });
    await harness.call('forge_update_site_healthcheck', { ...scope, healthcheck_endpoint: null });

    expect(paths()).toEqual([`GET ${SITE}/healthcheck`, `PUT ${SITE}/healthcheck`, `PUT ${SITE}/healthcheck`]);
    expect(harness.requests[1]?.body).toEqual({ healthcheck_endpoint: 'https://example.com/up' });
    expect(harness.requests[2]?.body).toEqual({ healthcheck_endpoint: null });
  });
});
