import { describe, expect, it } from 'vitest';
import { flattenCollection, flattenResource, flattenSingle, type CollectionDocument } from '../../src/forge/jsonapi.js';
import { fixture } from '../helpers/fixtures.js';

describe('flattenResource', () => {
  it('merges attributes and keeps the JSON:API id as canonical string id', () => {
    const flat = flattenResource({ id: '7', type: 'servers', attributes: { id: 7, name: 'web' } });
    expect(flat).toEqual({ id: '7', name: 'web' });
  });

  it('inlines included relationships and keeps unresolved identifiers', () => {
    const flat = flattenResource(
      {
        id: '1',
        type: 'sites',
        relationships: {
          server: { data: { type: 'servers', id: '7' } },
          tags: { data: [{ type: 'tags', id: '1' }, { type: 'tags', id: '2' }] },
          latestDeployment: { data: null },
        },
      },
      [{ id: '7', type: 'servers', attributes: { name: 'web' } }],
    );
    expect(flat).toEqual({
      id: '1',
      server: { id: '7', name: 'web' },
      tags: [{ type: 'tags', id: '1' }, { type: 'tags', id: '2' }],
      latestDeployment: null,
    });
  });
});

describe('flattenCollection', () => {
  it('flattens a spec-shaped server list', () => {
    const page = flattenCollection(fixture<CollectionDocument>('servers.index'));
    expect(page.nextCursor).toBeNull();
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({ id: '101', name: 'production-web-01', tags: [{ id: '9', name: 'production' }] });
  });

  it('exposes the next cursor', () => {
    expect(flattenCollection(fixture<CollectionDocument>('organizations.index')).nextCursor).toBe('eyJpZCI6Mn0');
  });
});

describe('flattenSingle', () => {
  it('flattens a single resource document', () => {
    expect(flattenSingle({ data: { id: '5', type: 'users', attributes: { name: 'Taylor' } } })).toEqual({ id: '5', name: 'Taylor' });
  });
});
