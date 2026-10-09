/**
 * Downloads the latest Forge OpenAPI spec and reports added/removed operations.
 * Run via `npm run spec:update` (also regenerates src/forge/schema.gen.ts).
 */
import { existsSync, writeFileSync } from 'node:fs';
import { SPEC_PATH, SPEC_URL, listOperations, loadSpec, type OpenApiSpec } from './spec.js';

const response = await fetch(SPEC_URL, { headers: { Accept: 'application/json' } });
if (!response.ok) {
  console.error(`Failed to download ${SPEC_URL}: ${response.status} ${response.statusText}`);
  process.exit(1);
}
const next = (await response.json()) as OpenApiSpec;

const before = new Set(existsSync(SPEC_PATH) ? listOperations(loadSpec()).map((operation) => operation.id) : []);
const after = new Set(listOperations(next).map((operation) => operation.id));

writeFileSync(SPEC_PATH, `${JSON.stringify(next, null, 2)}\n`);

const added = [...after].filter((id) => !before.has(id));
const removed = [...before].filter((id) => !after.has(id));
console.log(`Saved ${SPEC_PATH}: ${after.size} operations (+${added.length} / -${removed.length}).`);
added.forEach((id) => console.log(`  + ${id}`));
removed.forEach((id) => console.log(`  - ${id}`));
