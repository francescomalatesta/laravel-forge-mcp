import { afterEach, describe, expect, it } from 'vitest';
import { fixture } from '../helpers/fixtures.js';
import { createHarness, textOf } from '../helpers/harness.js';

let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
afterEach(async () => harness?.close());

describe('forge_list_organizations', () => {
  it('lists organizations with their slugs and pagination info', async () => {
    harness = await createHarness({ responses: [{ body: fixture('organizations.index') }] });

    const result = await harness.call('forge_list_organizations', { page_size: 2 });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      organizations: [
        { id: '1', name: 'Acme', slug: 'acme', created_at: '2025-07-29T09:00:00Z', updated_at: '2025-07-30T09:00:00Z' },
        { id: '2', name: 'Side Project', slug: 'side-project', created_at: '2025-08-01T10:00:00Z', updated_at: null },
      ],
      next_cursor: 'eyJpZCI6Mn0',
      has_more: true,
    });
    expect(textOf(result)).toContain('Found 2 organization(s): acme, side-project.');
    expect(textOf(result)).toContain('cursor "eyJpZCI6Mn0"');

    const [request] = harness.requests;
    expect(request?.url.pathname).toBe('/api/orgs');
    expect(request?.url.searchParams.get('page[size]')).toBe('2');
  });

  it('passes the cursor through', async () => {
    harness = await createHarness({ responses: [{ body: { data: [], links: {}, meta: { next_cursor: null } } }] });
    const result = await harness.call('forge_list_organizations', { cursor: 'abc' });
    expect(harness.requests[0]?.url.searchParams.get('page[cursor]')).toBe('abc');
    expect(textOf(result)).toBe('No organizations are accessible with this API token.\n\n{"organizations":[],"next_cursor":null,"has_more":false}');
  });

  it('reports invalid tokens with an actionable message', async () => {
    harness = await createHarness({ responses: [{ status: 401, body: { message: 'Unauthenticated.' } }] });
    const result = await harness.call('forge_list_organizations');
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('FORGE_API_TOKEN');
  });
});
