import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { listOperations, loadSpec } from '../../scripts/spec.js';
import { parseToolsets } from '../../src/config.js';
import { defineTool, type AnyToolDefinition } from '../../src/tools/define-tool.js';
import { operationOutput } from '../../src/tools/shared/async.js';
import { ALL_TOOLS, selectTools } from '../../src/tools/registry.js';
import { TOOLSET_NAMES } from '../../src/tools/toolsets.js';

const specOperations = new Map(listOperations(loadSpec()).map((operation) => [operation.id, operation]));

describe('tool definitions', () => {
  it('have unique, prefixed snake_case names', () => {
    const names = ALL_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^forge_[a-z0-9_]+$/);
  });

  it.each(ALL_TOOLS.map((tool) => [tool.name, tool] as const))('%s is consistent with the OpenAPI spec', (_name, tool) => {
    expect(TOOLSET_NAMES).toContain(tool.toolset);
    expect(tool.operations.length).toBeGreaterThan(0);

    for (const operationId of tool.operations) {
      const operation = specOperations.get(operationId);
      expect(operation, `unknown operationId ${operationId}`).toBeDefined();
      // Declared permissions must include everything the spec requires.
      expect(tool.permissions).toEqual(expect.arrayContaining(operation!.permissions));
      // A read-only tool may only cover GET operations.
      if (tool.readOnly) expect(operation!.method).toBe('GET');
    }
  });
});

describe('asynchronous operations contract (see CLAUDE.md)', () => {
  const isAsyncInSpec = (tool: AnyToolDefinition) =>
    tool.operations.some((id) => {
      const operation = specOperations.get(id);
      return operation !== undefined && operation.method !== 'GET' && operation.processingMode === 'async';
    });

  it.each(ALL_TOOLS.map((tool) => [tool.name, tool] as const))('%s', (_name, tool) => {
    // `async` must mirror the spec's x-processingMode of the tool's write operations.
    expect(Boolean(tool.async), 'async flag does not match x-processingMode in the spec').toBe(isAsyncInSpec(tool));

    if (tool.async) {
      // Same status/check_with definitions for every asynchronous tool.
      expect(tool.outputSchema.status).toBe(operationOutput.status);
      expect(tool.outputSchema.check_with).toBe(operationOutput.check_with);
    }

    if ('wait' in tool.inputSchema || 'timeout_seconds' in tool.inputSchema) {
      expect(tool.async, '`wait` is only for asynchronous tools').toBe(true);
      expect(Object.keys(tool.inputSchema)).toEqual(expect.arrayContaining(['wait', 'timeout_seconds']));
    }
  });
});

describe('selectTools', () => {
  const tool = (overrides: Partial<AnyToolDefinition>): AnyToolDefinition =>
    defineTool({
      name: 'forge_fake',
      title: 'Fake',
      description: 'Fake tool',
      toolset: 'core',
      operations: [],
      permissions: [],
      readOnly: true,
      inputSchema: {},
      outputSchema: { ok: z.boolean() },
      handler: async () => ({ structured: { ok: true }, summary: '' }),
      ...overrides,
    });

  const reader = tool({ name: 'forge_reader' });
  const writer = tool({ name: 'forge_writer', readOnly: false });
  const secret = tool({ name: 'forge_secret', exposesSecrets: true });
  const database = tool({ name: 'forge_database', toolset: 'databases' });
  const tools = [reader, writer, secret, database];

  const names = (config: Parameters<typeof selectTools>[0]) => selectTools(config, tools).map((t) => t.name);

  it('filters by toolset', () => {
    expect(names({ toolsets: parseToolsets('core'), readOnly: false, allowSecrets: true })).toEqual([
      'forge_reader',
      'forge_writer',
      'forge_secret',
    ]);
    expect(names({ toolsets: parseToolsets('all'), readOnly: false, allowSecrets: true })).toHaveLength(4);
  });

  it('keeps only read-only tools in read-only mode', () => {
    expect(names({ toolsets: parseToolsets('all'), readOnly: true, allowSecrets: true })).not.toContain('forge_writer');
  });

  it('hides secret-exposing tools unless allowed', () => {
    expect(names({ toolsets: parseToolsets('all'), readOnly: false, allowSecrets: false })).not.toContain('forge_secret');
  });
});
