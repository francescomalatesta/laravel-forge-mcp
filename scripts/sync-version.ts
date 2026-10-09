/**
 * Copies the package.json version into server.json (MCP Registry metadata).
 * Runs automatically from the `version` lifecycle script during `npm version`.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { name: string; version: string };
const server = JSON.parse(readFileSync('server.json', 'utf8')) as {
  version: string;
  packages?: { identifier: string; version?: string }[];
};

server.version = pkg.version;
for (const entry of server.packages ?? []) {
  if (entry.identifier === pkg.name) entry.version = pkg.version;
}

writeFileSync('server.json', `${JSON.stringify(server, null, 2)}\n`);
console.log(`server.json synced to version ${pkg.version}`);
