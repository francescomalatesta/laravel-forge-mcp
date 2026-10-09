import { afterEach, describe, expect, it } from 'vitest';
import { REDACTED } from '../../src/tools/shared/secrets.js';
import { createHarness, textOf } from '../helpers/harness.js';
import { specResponse, specSchema } from '../helpers/spec-fixtures.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

const site = (overrides: Record<string, unknown> = {}) =>
  specSchema('SiteResource', {
    id: '7',
    attributes: {
      name: 'example.com',
      status: 'installed',
      deployment_status: 'finished',
      deployment_url: 'https://forge.laravel.com/servers/3/sites/7/deploy/http?token=SECRET',
      repository: { provider: 'github', url: 'git@github.com:acme/app.git', branch: 'main', status: 'installed' },
      quick_deploy: true,
    },
    relationships: {
      server: { data: { type: 'servers', id: '3' } },
      latestDeployment: { data: { type: 'deployments', id: '55' } },
    },
    ...overrides,
  });

describe('forge_get_server', () => {
  it('returns every server field', async () => {
    harness = await createHarness({
      responses: [{ body: specResponse('organizations.servers.show', 200, { data: { id: '3', attributes: { name: 'web-1', is_ready: true } } }) }],
    });
    const result = await harness.call('forge_get_server', { server: 3 });

    expect(harness.requests[0]?.url.pathname).toBe('/api/orgs/acme/servers/3');
    expect(result.structuredContent).toMatchObject({ server: { id: '3', name: 'web-1', is_ready: true, ssh_port: 1, timezone: expect.any(String) } });
    expect(textOf(result)).toMatch(/^Server "web-1" \(3\) is ready/);
  });
});

describe('forge_list_sites', () => {
  it('lists organization sites with server and latest deployment resolved', async () => {
    harness = await createHarness({
      responses: [
        {
          body: specResponse('organizations.sites.index', 200, {
            data: [site()],
            included: [
              specSchema('ServerResource', { id: '3', attributes: { name: 'web-1' } }),
              specSchema('DeploymentResource', { id: '55', attributes: { status: 'failed', commit: { message: 'Fix checkout' } } }),
            ],
            meta: { next_cursor: null },
          }),
        },
      ],
    });

    const result = await harness.call('forge_list_sites', { name: 'example.com' });

    const url = harness.requests[0]!.url;
    expect(url.pathname).toBe('/api/orgs/acme/sites');
    expect(url.searchParams.get('include')).toBe('server,latestDeployment');
    expect(url.searchParams.get('filter[name]')).toBe('example.com');
    expect(result.structuredContent).toMatchObject({
      sites: [
        {
          id: '7',
          name: 'example.com',
          status: 'installed',
          repository_url: 'git@github.com:acme/app.git',
          repository_branch: 'main',
          quick_deploy: true,
          server_id: '3',
          server_name: 'web-1',
          latest_deployment: { id: '55', status: 'failed', commit_message: 'Fix checkout' },
        },
      ],
      has_more: false,
    });
    // Concise output never carries the deployment trigger URL.
    expect(JSON.stringify(result.structuredContent)).not.toContain('SECRET');
  });

  it('lists the sites of a server with sorting', async () => {
    harness = await createHarness({
      responses: [{ body: specResponse('organizations.servers.sites.index', 200, { data: [site({ relationships: { server: { data: null } } })] }) }],
    });
    const result = await harness.call('forge_list_sites', { server: '3', sort: ['-created_at'] });

    const url = harness.requests[0]!.url;
    expect(url.pathname).toBe('/api/orgs/acme/servers/3/sites');
    expect(url.searchParams.get('sort')).toBe('-created_at');
    expect(url.searchParams.get('include')).toBe('latestDeployment');
    expect((result.structuredContent as { sites: { server_id: string }[] }).sites[0]?.server_id).toBe('3');
  });

  it('lists sites across all organizations without needing an organization', async () => {
    harness = await createHarness({
      env: { FORGE_ORGANIZATION: '' },
      responses: [{ body: specResponse('sites.index', 200, { data: [site()] }) }],
    });
    await harness.call('forge_list_sites', { all_organizations: true });
    expect(harness.requests[0]?.url.pathname).toBe('/api/sites');
  });

  it('hides the deployment URL in detailed mode unless secrets are allowed', async () => {
    const body = () => specResponse('organizations.sites.index', 200, { data: [site()] });
    harness = await createHarness({ responses: [{ body: body() }] });
    const hidden = await harness.call('forge_list_sites', { response_format: 'detailed' });
    expect((hidden.structuredContent as { sites: { deployment_url: string }[] }).sites[0]?.deployment_url).toBe(REDACTED);
    await harness.close();

    harness = await createHarness({ env: { FORGE_ALLOW_SECRETS: 'true' }, responses: [{ body: body() }] });
    const shown = await harness.call('forge_list_sites', { response_format: 'detailed' });
    expect((shown.structuredContent as { sites: { deployment_url: string }[] }).sites[0]?.deployment_url).toContain('token=SECRET');
  });

  it.each([
    [{ server: 3, all_organizations: true }, 'not both'],
    [{ sort: ['name'] }, 'Sorting is only supported'],
  ])('rejects inconsistent arguments %j', async (args, message) => {
    harness = await createHarness();
    const result = await harness.call('forge_list_sites', args);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(message);
    expect(harness.requests).toHaveLength(0);
  });
});

describe('forge_get_site', () => {
  it('returns the site with its server ID and redacted secrets', async () => {
    harness = await createHarness({ responses: [{ body: specResponse('organizations.sites.show', 200, { data: site() }) }] });
    const result = await harness.call('forge_get_site', { site: 7 });

    expect(harness.requests[0]?.url.pathname).toBe('/api/orgs/acme/sites/7');
    expect(result.structuredContent).toMatchObject({
      site: { id: '7', server_id: '3', deployment_url: REDACTED, web_directory: expect.any(String) },
    });
    expect(textOf(result)).toContain('Site "example.com" (7) on server 3');
  });
});

describe('forge_list_server_events', () => {
  it('lists server events with filters and resolved relationships', async () => {
    harness = await createHarness({
      responses: [
        {
          body: specResponse('organizations.servers.events.index', 200, {
            data: [
              specSchema('EventResource', {
                id: '900',
                attributes: { description: 'Restarting Nginx', ran_as: 'root' },
                relationships: { initiator: { data: { type: 'users', id: '5' } }, site: { data: null } },
              }),
            ],
            included: [specSchema('UserResource', { id: '5', attributes: { name: 'Taylor' } })],
          }),
        },
      ],
    });

    const result = await harness.call('forge_list_server_events', { server: 3, ran_as: 'root', sort: ['-created_at'] });

    const url = harness.requests[0]!.url;
    expect(url.pathname).toBe('/api/orgs/acme/servers/3/events');
    expect(url.searchParams.get('filter[ran_as]')).toBe('root');
    expect(url.searchParams.get('include')).toBe('initiator,site');
    expect(result.structuredContent).toMatchObject({
      events: [{ id: '900', description: 'Restarting Nginx', ran_as: 'root', site_id: null, initiator_name: 'Taylor' }],
    });
  });

  it('lists organization-wide events without a server', async () => {
    harness = await createHarness({ responses: [{ body: specResponse('organizations.events.index') }] });
    await harness.call('forge_list_server_events');
    expect(harness.requests[0]?.url.pathname).toBe('/api/orgs/acme/events');
  });
});

describe('forge_get_server_event', () => {
  it('returns the event and the tail of its output', async () => {
    const output = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n');
    harness = await createHarness({
      responses: [
        { body: specResponse('organizations.servers.events.show', 200, { data: { id: '900', attributes: { description: 'Deploying' } } }) },
        { body: specResponse('organizations.servers.events.output.show', 200, { data: { attributes: { output } } }) },
      ],
    });

    const result = await harness.call('forge_get_server_event', { server: 3, event: 900, output_lines: 3 });

    expect(harness.requests.map((r) => r.url.pathname)).toEqual([
      '/api/orgs/acme/servers/3/events/900',
      '/api/orgs/acme/servers/3/events/900/output',
    ]);
    expect(result.structuredContent).toMatchObject({
      event: { id: '900', description: 'Deploying' },
      output: 'line 8\nline 9\nline 10',
      output_truncated: true,
      output_total_lines: 10,
    });
  });

  it('skips the output when not requested', async () => {
    harness = await createHarness({ responses: [{ body: specResponse('organizations.servers.events.show') }] });
    const result = await harness.call('forge_get_server_event', { server: 3, event: 1, include_output: false });
    expect(harness.requests).toHaveLength(1);
    expect(result.structuredContent).toMatchObject({ output: null, output_truncated: false });
  });
});
