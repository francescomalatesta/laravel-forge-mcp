import { describe, expect, it } from 'vitest';
import { fixture } from './helpers/fixtures.js';
import { allOperationIds, responseSchema, specResponse } from './helpers/spec-fixtures.js';
import { validateAgainstSpec } from './helpers/spec-schema.js';

/** Every fixture must be a valid response according to the Forge OpenAPI spec. */
const FIXTURES: { name: string; operationId: string; status: number }[] = [
  { name: 'organizations.index', operationId: 'organizations.index', status: 200 },
  { name: 'servers.index', operationId: 'organizations.servers.index', status: 200 },
];

describe('fixtures match the OpenAPI spec', () => {
  it.each(FIXTURES)('$name is a valid $operationId $status response', ({ name, operationId, status }) => {
    expect(validateAgainstSpec(operationId, status, fixture(name))).toEqual([]);
  });

  it('detects fixtures that drift from the spec', () => {
    const broken = fixture<{ data: { attributes: Record<string, unknown> }[] }>('servers.index');
    delete broken.data[0]!.attributes.name;
    expect(validateAgainstSpec('organizations.servers.index', 200, broken)).not.toEqual([]);
  });
});

describe('generated responses match the OpenAPI spec', () => {
  const cases = allOperationIds().flatMap((operationId) =>
    [200, 201, 202].filter((status) => responseSchema(operationId, status)).map((status) => ({ operationId, status })),
  );

  it('covers every JSON response in the spec', () => {
    expect(cases.length).toBeGreaterThan(150);
  });

  it.each(cases)('$operationId $status', ({ operationId, status }) => {
    expect(validateAgainstSpec(operationId, status, specResponse(operationId, status))).toEqual([]);
  });
});
