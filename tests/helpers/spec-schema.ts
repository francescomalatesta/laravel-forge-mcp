import { createRequire } from 'node:module';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { listOperations, loadSpec } from '../../scripts/spec.js';

const spec = loadSpec();
const operations = new Map(listOperations(spec).map((operation) => [operation.id, operation]));

const ajv = new Ajv2020({ strict: false, allErrors: true });
// ajv-formats is CommonJS; require() sidesteps default-export interop differences.
const addFormats = createRequire(import.meta.url)('ajv-formats') as typeof import('ajv-formats').default;
addFormats(ajv);

/**
 * Validates `body` against the response schema the spec declares for
 * `operationId` and `status`. Returns a list of errors (empty when valid).
 */
export function validateAgainstSpec(operationId: string, status: number, body: unknown): string[] {
  const operation = operations.get(operationId);
  if (!operation) return [`Unknown operationId "${operationId}"`];

  const content = operation.operation.responses?.[String(status)]?.content ?? {};
  const schema = Object.values(content)[0]?.schema;
  if (!schema) return [`No ${status} response schema for "${operationId}"`];

  // Make "#/components/..." references resolvable from the response schema.
  const validate = ajv.compile({ ...(schema as object), components: spec.components });
  if (validate(body)) return [];
  return (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? ''}`.trim());
}
