import { describe, expect, it } from 'vitest';
import { apiPath } from '../../src/forge/path.js';
import { buildQuery } from '../../src/forge/query.js';

describe('buildQuery', () => {
  it('uses bracket notation for nested params and commas for arrays', () => {
    const query = buildQuery({
      page: { size: 30, cursor: 'abc' },
      filter: { name: 'web', region: undefined, provider: '' },
      sort: ['name', '-created_at'],
      include: [],
    });
    expect(decodeURIComponent(query.toString())).toBe('page[size]=30&page[cursor]=abc&filter[name]=web&sort=name,-created_at');
  });

  it('returns an empty query for undefined input', () => {
    expect(buildQuery(undefined).toString()).toBe('');
  });
});

describe('apiPath', () => {
  it('encodes interpolated segments only', () => {
    expect(apiPath`/orgs/${'my org/x'}/servers/${42}`).toBe('/orgs/my%20org%2Fx/servers/42');
  });
});
