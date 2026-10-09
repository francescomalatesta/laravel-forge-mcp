import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, textOf } from '../helpers/harness.js';
import { specResponse, specSchema } from '../helpers/spec-fixtures.js';
import { REDACTED } from '../../src/tools/shared/secrets.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

const SERVER = '/api/orgs/acme/servers/3';
const SITE = `${SERVER}/sites/7`;
const SECRET = 'nova-license-key';
const paths = () => harness!.requests.map((r) => `${r.method} ${r.url.pathname}`);
const gone = { status: 404, body: { message: 'Not found.' } };

describe('package credentials', () => {
  const composer = (password = SECRET) =>
    specSchema('ComposerCredentialResource', { id: 'nova.laravel.com', attributes: { repository: 'nova.laravel.com', username: 'me@example.com', password } });
  const showComposer = (password = SECRET) => ({
    body: specResponse('organizations.servers.sites.composer.credentials.show', 200, { data: composer(password) }),
  });

  it('forge_list_package_credentials hides passwords', async () => {
    harness = await createHarness({
      responses: [{ body: specResponse('organizations.servers.sites.composer.credentials.index', 200, { data: [composer()] }) }],
    });
    const result = await harness.call('forge_list_package_credentials', { server: 3, site: 7, manager: 'composer' });
    expect(paths()).toEqual([`GET ${SITE}/composer/credentials`]);
    expect(result.structuredContent).toMatchObject({
      credentials: [{ manager: 'composer', repository: 'nova.laravel.com', username: 'me@example.com', secret: REDACTED }],
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('forge_set_package_credentials adds new Composer credentials and waits until saved', async () => {
    harness = await createHarness({ responses: [gone, { status: 202 }, showComposer()] });
    const result = await harness.call('forge_set_package_credentials', {
      server: 3,
      site: 7,
      manager: 'composer',
      repository: 'nova.laravel.com',
      username: 'me@example.com',
      password: SECRET,
    });
    expect(paths()).toEqual([
      `GET ${SITE}/composer/credentials/nova.laravel.com`,
      `POST ${SITE}/composer/credentials`,
      `GET ${SITE}/composer/credentials/nova.laravel.com`,
    ]);
    expect(harness.requests[1]?.body).toEqual({ repository: 'nova.laravel.com', username: 'me@example.com', password: SECRET });
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_package_credentials', created: true });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('forge_set_package_credentials replaces existing npm credentials', async () => {
    const npm = (token: string) =>
      specSchema('NpmCredentialResource', { id: 'npm.pkg.github.com', attributes: { registry: 'npm.pkg.github.com', token, scopes: ['@acme'] } });
    harness = await createHarness({
      responses: [
        { body: specResponse('organizations.servers.sites.npm.credentials.show', 200, { data: npm('old') }) },
        { status: 202 },
        { body: specResponse('organizations.servers.sites.npm.credentials.show', 200, { data: npm('new-token') }) },
      ],
    });
    const result = await harness.call('forge_set_package_credentials', {
      server: 3,
      site: 7,
      manager: 'npm',
      repository: 'npm.pkg.github.com',
      token: 'new-token',
      scopes: ['@acme'],
    });
    expect(harness.requests[1]).toMatchObject({ method: 'PUT', body: { registry: 'npm.pkg.github.com', token: 'new-token', scopes: ['@acme'] } });
    expect(result.structuredContent).toMatchObject({ status: 'completed', created: false });
  });

  it.each([
    [{ manager: 'composer', token: 't' }, 'Composer credentials need'],
    [{ manager: 'npm', username: 'u', password: 'p' }, 'npm credentials need'],
  ])('forge_set_package_credentials validates %o', async (input, message) => {
    harness = await createHarness();
    const result = await harness.call('forge_set_package_credentials', { server: 3, site: 7, repository: 'x', ...input });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(message);
  });

  it('forge_delete_package_credentials waits until they are gone', async () => {
    harness = await createHarness({ responses: [{ status: 202 }, gone] });
    const result = await harness.call('forge_delete_package_credentials', { server: 3, site: 7, manager: 'npm', repository: 'npm.pkg.github.com' });
    expect(paths()).toEqual([`DELETE ${SITE}/npm/credentials/npm.pkg.github.com`, `GET ${SITE}/npm/credentials/npm.pkg.github.com`]);
    expect(result.structuredContent).toEqual({ status: 'completed', check_with: 'forge_list_package_credentials' });
  });
});

describe('load balancing', () => {
  const nodes = (...items: Array<{ server_id: number; weight: number; down?: boolean }>) => ({
    body: specResponse('organizations.servers.sites.load-balancing-nodes.index', 200, {
      data: items.map((item, i) =>
        specSchema('LoadBalancingNodeResource', { id: String(i + 1), attributes: { port: 80, backup: false, down: false, ...item } }),
      ),
    }),
  });

  it('forge_get_load_balancer lists the nodes', async () => {
    harness = await createHarness({ responses: [nodes({ server_id: 4, weight: 1 }, { server_id: 5, weight: 2, down: true })] });
    const result = await harness.call('forge_get_load_balancer', { server: 3, site: 7 });
    expect(result.structuredContent).toMatchObject({ nodes: [{ server_id: '4', weight: 1 }, { server_id: '5', down: true }] });
    expect(textOf(result)).toContain('5 (weight 2, down)');
  });

  it('forge_update_load_balancer replaces the nodes and waits for them', async () => {
    harness = await createHarness({
      responses: [{ status: 202 }, nodes({ server_id: 4, weight: 1 }), nodes({ server_id: 4, weight: 1 }, { server_id: 5, weight: 1, down: true })],
    });
    const result = await harness.call('forge_update_load_balancer', {
      server: 3,
      site: 7,
      nodes: [{ server_id: 4 }, { server_id: 5, down: true }],
      method: 'least_conn',
    });
    expect(harness.requests[0]).toMatchObject({
      method: 'PUT',
      body: {
        balancer_method: 'least_conn',
        balancing: [
          { server_id: 4, weight: 1, backup: false, down: false },
          { server_id: 5, weight: 1, backup: false, down: true },
        ],
      },
    });
    expect(result.structuredContent).toMatchObject({ status: 'completed' });
  });
});

describe('Nginx templates', () => {
  const env = { FORGE_TOOLSETS: 'core,servers' };
  const TEMPLATES = `${SERVER}/nginx/templates`;
  const template = (attributes: Record<string, unknown> = {}) =>
    specSchema('NginxTemplateResource', { id: '2', attributes: { name: 'Octane', content: 'server { listen {{PORT}}; }', ...attributes } });

  it('forge_list_nginx_templates omits content unless detailed', async () => {
    harness = await createHarness({
      env,
      responses: [{ body: specResponse('organizations.servers.nginx.templates.index', 200, { data: [template()] }) }],
    });
    const result = await harness.call('forge_list_nginx_templates', { server: 3 });
    expect((result.structuredContent as { templates: Record<string, unknown>[] }).templates[0]).not.toHaveProperty('content');
  });

  it('forge_create_nginx_template creates a template', async () => {
    harness = await createHarness({ env, responses: [{ body: specResponse('organizations.servers.nginx.templates.store', 200, { data: template() }) }] });
    const result = await harness.call('forge_create_nginx_template', { server: 3, name: 'Octane', content: 'server { listen {{PORT}}; }' });
    expect(harness.requests[0]).toMatchObject({ method: 'POST', body: { name: 'Octane', content: 'server { listen {{PORT}}; }' } });
    expect(result.structuredContent).toMatchObject({ template: { id: '2', name: 'Octane' } });
  });

  it('forge_update_nginx_template keeps the current content when renaming', async () => {
    harness = await createHarness({
      env,
      responses: [
        { body: specResponse('organizations.servers.nginx.templates.show', 200, { data: template() }) },
        { body: specResponse('organizations.servers.nginx.templates.update', 200, { data: template({ name: 'Octane v2' }) }) },
      ],
    });
    await harness.call('forge_update_nginx_template', { server: 3, template: 2, name: 'Octane v2' });
    expect(harness.requests[1]).toMatchObject({ method: 'PUT', body: { name: 'Octane v2', content: 'server { listen {{PORT}}; }' } });
  });

  it('forge_delete_nginx_template deletes it', async () => {
    harness = await createHarness({ env, responses: [{ status: 204 }] });
    const result = await harness.call('forge_delete_nginx_template', { server: 3, template: 2 });
    expect(paths()).toEqual([`DELETE ${TEMPLATES}/2`]);
    expect(result.structuredContent).toEqual({ deleted: true });
  });
});
