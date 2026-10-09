import { listOperations, loadSpec } from '../../scripts/spec.js';
import { validateAgainstSpec } from './spec-schema.js';

/**
 * Builds realistic API responses straight from the OpenAPI spec, so tests only
 * spell out the fields they care about:
 *
 *   specResponse('organizations.servers.sites.deployments.show', 200, { data: { id: '9' } })
 *
 * Values come from the schema's examples/defaults/enums, falling back to
 * type-based placeholders. Overrides are deep-merged (arrays are replaced).
 */

type Schema = Record<string, unknown>;

const spec = loadSpec();
const operations = new Map(listOperations(spec).map((operation) => [operation.id, operation]));

export function responseSchema(operationId: string, status: number): Schema | undefined {
  const operation = operations.get(operationId);
  if (!operation) throw new Error(`Unknown operationId "${operationId}"`);
  const content = operation.operation.responses?.[String(status)]?.content ?? {};
  const json = Object.entries(content).find(([type]) => type.includes('json'));
  return json?.[1].schema as Schema | undefined;
}

/**
 * A response for `operationId` built from the spec, with `overrides` deep-merged.
 * Throws when the result does not match the spec, so mocks cannot drift from the real API.
 */
export function specResponse<T = Record<string, unknown>>(operationId: string, status = 200, overrides: unknown = {}): T {
  const schema = responseSchema(operationId, status);
  if (!schema) throw new Error(`No ${status} JSON response schema for "${operationId}"`);
  const body = merge(generate(schema), overrides);
  const errors = validateAgainstSpec(operationId, status, body);
  if (errors.length > 0) throw new Error(`Mock ${operationId} ${status} does not match the spec:\n${errors.join('\n')}`);
  return body as T;
}

/** A component schema instance (e.g. "SiteResource") with `overrides` deep-merged. */
export function specSchema<T = Record<string, unknown>>(name: string, overrides: unknown = {}): T {
  const schema = (spec.components.schemas as Record<string, Schema>)[name];
  if (!schema) throw new Error(`Unknown component schema "${name}"`);
  return merge(generate(schema), overrides) as T;
}

export function generate(schema: Schema, name = '', depth = 0): unknown {
  const resolved = deref(schema);
  if (depth > 12) return null;

  if ('const' in resolved) return resolved.const;
  const examples = resolved.examples;
  if (Array.isArray(examples) && examples.length > 0) return examples[0];
  if ('example' in resolved) return resolved.example;
  if ('default' in resolved) return resolved.default;
  if (Array.isArray(resolved.enum) && resolved.enum.length > 0) return resolved.enum[0];

  for (const key of ['anyOf', 'oneOf'] as const) {
    const options = resolved[key] as Schema[] | undefined;
    if (options) {
      const preferred = options.find((option) => deref(option).type !== 'null') ?? options[0]!;
      return generate(preferred, name, depth + 1);
    }
  }
  if (Array.isArray(resolved.allOf)) {
    return (resolved.allOf as Schema[]).reduce<unknown>((value, part) => merge(value, generate(part, name, depth + 1)), {});
  }

  const type = Array.isArray(resolved.type) ? resolved.type.find((t) => t !== 'null') : resolved.type;
  switch (type) {
    case 'object':
    case undefined: {
      const properties = (resolved.properties ?? {}) as Record<string, Schema>;
      if (type === undefined && Object.keys(properties).length === 0) return null;
      return Object.fromEntries(
        Object.entries(properties).map(([key, value]) => [key, generate(value, key, depth + 1)]),
      );
    }
    case 'array':
      return resolved.items ? [generate(resolved.items as Schema, name, depth + 1)] : [];
    case 'string':
      return placeholderString(resolved, name);
    case 'integer':
    case 'number':
      return typeof resolved.minimum === 'number' ? Math.max(1, resolved.minimum) : 1;
    case 'boolean':
      return true;
    case 'null':
      return null;
    default:
      return null;
  }
}

function placeholderString(schema: Schema, name: string): string {
  switch (schema.format) {
    case 'date-time':
      return '2025-07-29T09:00:00Z';
    case 'uri':
      return 'https://example.com';
    case 'email':
      return 'user@example.com';
  }
  if (name === 'id') return '1';
  return name ? `${name}-value` : 'value';
}

function deref(schema: Schema): Schema {
  let current = schema;
  while (typeof current.$ref === 'string') {
    const path = current.$ref.replace(/^#\//, '').split('/');
    current = path.reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], spec) as Schema;
  }
  return current;
}

function merge(base: unknown, override: unknown): unknown {
  if (override === undefined) return base;
  if (isObject(base) && isObject(override)) {
    const result: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(override)) result[key] = merge(base[key], value);
    return result;
  }
  return override;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function allOperationIds(): string[] {
  return [...operations.keys()];
}
