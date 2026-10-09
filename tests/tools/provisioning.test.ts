import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, textOf } from '../helpers/harness.js';
import { specResponse, specSchema } from '../helpers/spec-fixtures.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

const env = { FORGE_TOOLSETS: 'core,providers,servers' };
const paths = () => harness!.requests.map((r) => `${r.method} ${r.url.pathname}`);

const providerList = () => ({
  body: specResponse('providers.index', 200, {
    data: [
      specSchema('ProviderResource', { id: '1', attributes: { name: 'DigitalOcean', slug: 'ocean2' } }),
      specSchema('ProviderResource', { id: '2', attributes: { name: 'Hetzner', slug: 'hetzner' } }),
    ],
  }),
});
const regionList = () => ({
  body: specResponse('providers.regions.index', 200, {
    data: [specSchema('ProviderRegionResource', { id: '7', attributes: { name: 'Frankfurt 1', code: 'fra1', alternate_code: null } })],
  }),
});

describe('core additions', () => {
  it('forge_get_current_user shows the token owner', async () => {
    harness = await createHarness({
      responses: [{ body: specResponse('user.show', 200, { data: { id: '1', attributes: { name: 'Taylor', email: 'taylor@example.com' } } }) }],
    });
    const result = await harness.call('forge_get_current_user', {});
    expect(paths()).toEqual(['GET /api/user']);
    expect(result.structuredContent).toMatchObject({ id: '1', name: 'Taylor', email: 'taylor@example.com' });
  });

  it('forge_list_organizations gets one organization by slug', async () => {
    harness = await createHarness({
      responses: [{ body: specResponse('organizations.show', 200, { data: { id: '3', attributes: { name: 'Acme', slug: 'acme' } } }) }],
    });
    const result = await harness.call('forge_list_organizations', { slug: 'acme' });
    expect(paths()).toEqual(['GET /api/orgs/acme']);
    expect(result.structuredContent).toMatchObject({ organizations: [{ id: '3', slug: 'acme' }] });
  });
});

describe('provider catalog', () => {
  it('forge_list_providers lists providers', async () => {
    harness = await createHarness({ env, responses: [providerList()] });
    const result = await harness.call('forge_list_providers', {});
    expect(textOf(result)).toMatch(/DigitalOcean \(ocean2\), Hetzner \(hetzner\)/);
  });

  it('forge_list_provider_regions resolves the provider slug', async () => {
    harness = await createHarness({ env, responses: [providerList(), regionList()] });
    const result = await harness.call('forge_list_provider_regions', { provider: 'hetzner' });
    expect(paths()).toEqual(['GET /api/providers', 'GET /api/providers/2/regions']);
    expect(result.structuredContent).toMatchObject({ regions: [{ id: '7', code: 'fra1' }] });
  });

  it('forge_list_provider_sizes lists the sizes of a region by code', async () => {
    harness = await createHarness({
      env,
      responses: [
        regionList(),
        { body: specResponse('providers.regions.sizes.index', 200, { data: [specSchema('ProviderRegionSizeResource', { id: 's-1vcpu-2gb', attributes: { name: '1 vCPU / 2 GB' } })] }) },
      ],
    });
    const result = await harness.call('forge_list_provider_sizes', { provider: 1, region: 'fra1' });
    expect(paths()).toEqual(['GET /api/providers/1/regions', 'GET /api/providers/1/regions/7/sizes']);
    expect(result.structuredContent).toMatchObject({ sizes: [{ id: 's-1vcpu-2gb', name: '1 vCPU / 2 GB' }] });
  });

  it('reports unknown provider slugs', async () => {
    harness = await createHarness({ env, responses: [providerList()] });
    const result = await harness.call('forge_list_provider_regions', { provider: 'linode' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Unknown provider "linode"');
  });

  it('forge_list_server_credentials and VPCs', async () => {
    const vpc = specSchema('VpcResource', { id: 'vpc-1', attributes: { name: 'private', cidrBlock: '10.0.0.0/16', region: 'fra1', subnets: [] } });
    harness = await createHarness({
      env,
      responses: [
        {
          body: specResponse('organizations.server-credentials.index', 200, {
            data: [specSchema('ServerCredentialResource', { id: '9', attributes: { name: 'DO', provider: 'ocean2' } })],
          }),
        },
        { body: specResponse('organizations.server-credentials.vpcs.index', 200, { data: [vpc] }) },
        { status: 201, body: specResponse('organizations.server-credentials.vpcs.store', 201, { data: vpc }) },
      ],
    });
    const credentials = await harness.call('forge_list_server_credentials', {});
    expect(credentials.structuredContent).toMatchObject({ credentials: [{ id: '9', provider: 'ocean2' }] });
    await harness.call('forge_list_vpcs', { credential: 9, region: 'fra1' });
    const created = await harness.call('forge_create_vpc', { credential: 9, region: 'fra1', name: 'private' });
    expect(paths()).toEqual([
      'GET /api/orgs/acme/server-credentials',
      'GET /api/orgs/acme/server-credentials/9/regions/fra1/vpcs',
      'POST /api/orgs/acme/server-credentials/9/regions/fra1/vpcs',
    ]);
    expect(created.structuredContent).toMatchObject({ vpc: { id: 'vpc-1', cidrBlock: '10.0.0.0/16' } });
  });
});

describe('forge_create_server', () => {
  const server = (isReady: boolean) => specSchema('ServerResource', { id: '42', attributes: { id: 42, name: 'web-1', is_ready: isReady } });
  const created = { status: 202, body: specResponse('organizations.servers.store', 202, { data: server(false) }) };
  const show = (isReady: boolean) => ({ body: specResponse('organizations.servers.show', 200, { data: server(isReady) }) });

  it('creates a DigitalOcean server and waits until it is ready', async () => {
    harness = await createHarness({ env, responses: [created, show(false), show(true)] });
    const result = await harness.call('forge_create_server', {
      name: 'web-1',
      provider: 'ocean2',
      credential: 9,
      region: 'fra1',
      size: 's-1vcpu-2gb',
      vpc: 'vpc-1',
      php_version: '8.4',
      database_type: 'mysql84',
    });
    expect(harness.requests[0]).toMatchObject({
      method: 'POST',
      body: {
        name: 'web-1',
        provider: 'ocean2',
        credential_id: 9,
        type: 'app',
        ubuntu_version: '24.04',
        php_version: 'php84',
        database_type: 'mysql84',
        ocean2: { region_id: 'fra1', size_id: 's-1vcpu-2gb', vpc_uuid: 'vpc-1' },
      },
    });
    expect(paths()).toEqual(['POST /api/orgs/acme/servers', 'GET /api/orgs/acme/servers/42', 'GET /api/orgs/acme/servers/42']);
    expect(result.structuredContent).toMatchObject({ status: 'completed', server: { id: '42', is_ready: true } });
  });

  it('maps the Hetzner network and backups', async () => {
    harness = await createHarness({ env, responses: [created] });
    await harness.call('forge_create_server', {
      name: 'web-1',
      provider: 'hetzner',
      credential: 9,
      region: 'fsn1',
      size: 'cx22',
      vpc: '123',
      backups: true,
      wait: false,
    });
    expect(harness.requests[0]?.body).toMatchObject({
      hetzner: { region_id: 'fsn1', size_id: 'cx22', network_id: 123, enable_daily_backups: true, enable_weekly_backups: true },
    });
  });

  it('registers a custom server without waiting', async () => {
    harness = await createHarness({ env, responses: [created] });
    const result = await harness.call('forge_create_server', { name: 'web-1', provider: 'custom', ip_address: '203.0.113.10', ssh_port: 2222 });
    expect(harness.requests[0]?.body).toMatchObject({ provider: 'custom', custom: { ip_address: '203.0.113.10', ssh_port: 2222 } });
    expect(result.structuredContent).toMatchObject({ status: 'queued', server: { id: '42' } });
    expect(textOf(result)).toContain('provisioning command');
  });

  it.each([
    [{ provider: 'ocean2', region: 'fra1', size: 's' }, 'need `credential`'],
    [{ provider: 'ocean2', credential: 9 }, 'need `region` and `size`'],
    [{ provider: 'hetzner', credential: 9, region: 'fsn1', size: 'cx22' }, 'Hetzner servers need `vpc`'],
    [{ provider: 'custom' }, 'needs `ip_address`'],
    [{ provider: 'akamai', credential: 9, region: 'r', size: 's', backups: true }, '`backups` not used by provider akamai'],
    [{ provider: 'custom', ip_address: '1.2.3.4', credential: 9 }, '`credential` is not used'],
    [{ provider: 'ocean2', credential: 9, region: 'fra1', size: 's', php_version: '9.9' }, 'Unknown PHP version'],
  ])('validates %o before calling Forge', async (input, message) => {
    harness = await createHarness({ env });
    const result = await harness.call('forge_create_server', { name: 'web-1', ...input });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(message);
  });
});
