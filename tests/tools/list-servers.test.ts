import { afterEach, describe, expect, it } from 'vitest';
import { fixture } from '../helpers/fixtures.js';
import { createHarness, textOf } from '../helpers/harness.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

describe('forge_list_servers', () => {
  it('is advertised with annotations, permissions and schemas', async () => {
    harness = await createHarness();
    const { tools } = await harness.client.listTools();
    const tool = tools.find((t) => t.name === 'forge_list_servers');

    expect(tool?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true });
    expect(tool?.description).toContain('Required Forge permission: server:view.');
    expect(Object.keys(tool?.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(['organization', 'name', 'sort', 'page_size', 'cursor', 'response_format']),
    );
    expect(tool?.outputSchema?.properties).toHaveProperty('servers');
  });

  it('returns concise servers by default', async () => {
    harness = await createHarness({ responses: [{ body: fixture('servers.index') }] });

    const result = await harness.call('forge_list_servers');

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      servers: [
        {
          id: '101',
          name: 'production-web-01',
          type: 'app',
          provider: 'ocean2',
          region: 'nyc3',
          size: 's-2vcpu-2gb',
          ip_address: '192.168.1.1',
          php_version: 'php83',
          database_type: 'mysql8',
          is_ready: true,
          connection_status: 'successful',
        },
        {
          id: '102',
          name: 'staging-worker',
          type: 'worker',
          provider: 'custom',
          region: 'custom',
          size: 'custom',
          ip_address: null,
          php_version: null,
          database_type: null,
          is_ready: false,
          connection_status: null,
        },
      ],
      next_cursor: null,
      has_more: false,
    });
    expect(textOf(result)).toMatch(/^Found 2 server\(s\) in organization "acme"\./);
    expect(harness.requests[0]?.url.pathname).toBe('/api/orgs/acme/servers');
  });

  it('returns every field and resolved tags in detailed mode', async () => {
    harness = await createHarness({ responses: [{ body: fixture('servers.index') }] });

    const result = await harness.call('forge_list_servers', { response_format: 'detailed' });
    const [server] = (result.structuredContent as { servers: Record<string, unknown>[] }).servers;

    expect(server).toMatchObject({
      id: '101',
      ssh_port: 22,
      timezone: 'UTC',
      tags: [{ id: '9', name: 'production' }],
    });
  });

  it('translates filters, sort and pagination into Forge query parameters', async () => {
    harness = await createHarness({ responses: [{ body: fixture('servers.index') }] });

    await harness.call('forge_list_servers', {
      organization: 'other-org',
      name: 'web',
      php_version: 'php83',
      sort: ['-created_at', 'name'],
      page_size: 5,
      cursor: 'next',
    });

    const url = harness.requests[0]!.url;
    expect(url.pathname).toBe('/api/orgs/other-org/servers');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      'filter[name]': 'web',
      'filter[php_version]': 'php83',
      sort: '-created_at,name',
      'page[size]': '5',
      'page[cursor]': 'next',
    });
  });

  it('rejects invalid arguments before calling Forge', async () => {
    harness = await createHarness();
    const result = await harness.call('forge_list_servers', { sort: ['ip_address'], page_size: 500 });
    expect(result.isError).toBe(true);
    expect(harness.requests).toHaveLength(0);
  });

  it('explains how to fix a missing organization', async () => {
    harness = await createHarness({ env: { FORGE_ORGANIZATION: '' } });
    const result = await harness.call('forge_list_servers');
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('forge_list_organizations');
    expect(harness.requests).toHaveLength(0);
  });

  it('adds hints to API errors', async () => {
    harness = await createHarness({
      responses: [
        { status: 404, body: { message: 'Not found.' } },
        { status: 403, body: { message: 'This action is unauthorized.' } },
      ],
    });

    const notFound = await harness.call('forge_list_servers', { organization: 'missing' });
    expect(notFound.isError).toBe(true);
    expect(textOf(notFound)).toBe('Not found (404): Not found. Check the organization slug with forge_list_organizations.');

    const forbidden = await harness.call('forge_list_servers');
    expect(textOf(forbidden)).toContain('requires the Forge permission(s): server:view');
  });
});
