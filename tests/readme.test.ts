import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_TOOLS } from '../src/tools/registry.js';
import { TOOLSET_NAMES } from '../src/tools/toolsets.js';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

describe('README', () => {
  it('lists every tool with its toolset', () => {
    const missing = ALL_TOOLS.filter((tool) => !new RegExp(`\\| \`${tool.name}\`( 🔑)? \\| ${tool.toolset} \\|`).test(readme)).map((tool) => tool.name);
    expect(missing).toEqual([]);
  });

  it('lists no tool that does not exist', () => {
    const names = new Set(ALL_TOOLS.map((tool) => tool.name));
    const listed = [...readme.matchAll(/^\| `(forge_[a-z_]+)`/gm)].map((match) => match[1]!);
    expect(listed.filter((name) => !names.has(name))).toEqual([]);
  });

  it('describes every toolset', () => {
    expect(TOOLSET_NAMES.filter((name) => !readme.includes(`| \`${name}\` |`))).toEqual([]);
  });
});
