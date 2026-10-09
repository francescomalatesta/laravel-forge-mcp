/**
 * Reports how many Forge API operations are covered by MCP tools.
 *
 *   npm run coverage:api              summary per tag
 *   npm run coverage:api -- --missing also list uncovered operations
 *
 * Fails when a tool declares an operationId that does not exist in the spec.
 */
import { ALL_TOOLS } from '../src/tools/registry.js';
import { OPERATION_ALIASES } from './operation-aliases.js';
import { listOperations, loadSpec } from './spec.js';

const showMissing = process.argv.includes('--missing');

const operations = listOperations(loadSpec());
const known = new Set(operations.map((operation) => operation.id));

const coveredBy = new Map<string, string[]>();
const unknown: string[] = [];
for (const tool of ALL_TOOLS) {
  for (const operationId of tool.operations) {
    if (!known.has(operationId)) unknown.push(`${tool.name} → ${operationId}`);
    coveredBy.set(operationId, [...(coveredBy.get(operationId) ?? []), tool.name]);
  }
}

for (const [alias, { target }] of Object.entries(OPERATION_ALIASES)) {
  if (!known.has(alias) || !known.has(target)) unknown.push(`alias ${alias} → ${target}`);
  if (coveredBy.has(target) && !coveredBy.has(alias)) coveredBy.set(alias, [`alias of ${target}`]);
}

const byTag = new Map<string, { total: number; covered: number }>();
for (const operation of operations) {
  const stats = byTag.get(operation.tag) ?? { total: 0, covered: 0 };
  stats.total++;
  if (coveredBy.has(operation.id)) stats.covered++;
  byTag.set(operation.tag, stats);
}

const covered = operations.filter((operation) => coveredBy.has(operation.id)).length;
const percent = (part: number, total: number) => (total === 0 ? '0.0' : ((part / total) * 100).toFixed(1));

const viaAlias = Object.keys(OPERATION_ALIASES).filter((alias) => coveredBy.get(alias)?.[0]?.startsWith('alias of')).length;
console.log(
  `Forge API coverage: ${covered}/${operations.length} operations (${percent(covered, operations.length)}%) by ${ALL_TOOLS.length} tools${
    viaAlias > 0 ? ` (${viaAlias} duplicate endpoint(s) counted through aliases)` : ''
  }\n`,
);
const width = Math.max(...[...byTag.keys()].map((tag) => tag.length));
for (const [tag, stats] of [...byTag.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${tag.padEnd(width)}  ${String(stats.covered).padStart(3)}/${String(stats.total).padEnd(3)}  ${percent(stats.covered, stats.total).padStart(5)}%`);
}

if (showMissing) {
  console.log('\nUncovered operations:');
  for (const operation of operations.filter((operation) => !coveredBy.has(operation.id))) {
    console.log(`  [${operation.tag}] ${operation.method.padEnd(6)} ${operation.path}  (${operation.id})`);
  }
}

if (unknown.length > 0) {
  console.error(`\nTools reference operationIds missing from the spec:\n${unknown.map((line) => `  ${line}`).join('\n')}`);
  process.exit(1);
}
