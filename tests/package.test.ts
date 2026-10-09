import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const server = JSON.parse(readFileSync(new URL('../server.json', import.meta.url), 'utf8'));

describe('publishing metadata', () => {
  it('server.json matches package.json (required by the MCP Registry)', () => {
    expect(server.name).toBe(pkg.mcpName);
    expect(server.version).toBe(pkg.version);
    expect(server.packages).toEqual([
      expect.objectContaining({ registryType: 'npm', identifier: pkg.name, version: pkg.version }),
    ]);
  });

  it('keeps the registry description within 100 characters', () => {
    expect(server.description.length).toBeLessThanOrEqual(100);
  });

  it('documents every environment variable the server reads', () => {
    const declared = server.packages[0].environmentVariables.map((variable: { name: string }) => variable.name);
    const config = readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8');
    const read = [...config.matchAll(/env\.(FORGE_[A-Z_]+)/g)].map((match) => match[1]);
    const advanced = ['FORGE_API_URL', 'FORGE_TIMEOUT_MS', 'FORGE_MAX_RETRIES'];
    expect(declared.sort()).toEqual([...new Set(read)].filter((name) => !advanced.includes(name!)).sort());
  });

  it('ships an executable entry point', () => {
    expect(pkg.bin['laravel-forge-mcp']).toBe('dist/index.js');
    expect(readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8').startsWith('#!/usr/bin/env node')).toBe(true);
  });
});
