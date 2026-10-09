import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SPEC_PATH = fileURLToPath(new URL('../spec/forge.openapi.json', import.meta.url));
export const SPEC_URL = 'https://forge.laravel.com/api/docs.openapi';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  tags?: string[];
  parameters?: { name: string; in: string; schema?: unknown }[];
  responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
  'x-permissions'?: string[];
  'x-processingMode'?: 'sync' | 'async';
}

export interface OpenApiSpec {
  info: { title: string; version: string };
  paths: Record<string, Partial<Record<(typeof METHODS)[number], OpenApiOperation>>>;
  components: Record<string, Record<string, unknown>>;
}

export interface SpecOperation {
  id: string;
  method: string;
  path: string;
  tag: string;
  summary: string;
  permissions: string[];
  processingMode: string | undefined;
  operation: OpenApiOperation;
}

export function loadSpec(path: string = SPEC_PATH): OpenApiSpec {
  return JSON.parse(readFileSync(path, 'utf8')) as OpenApiSpec;
}

export function listOperations(spec: OpenApiSpec): SpecOperation[] {
  const operations: SpecOperation[] = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const operation = item[method];
      if (!operation) continue;
      operations.push({
        id: operation.operationId ?? `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path,
        tag: operation.tags?.[0] ?? 'Untagged',
        summary: operation.summary ?? '',
        permissions: operation['x-permissions'] ?? [],
        processingMode: operation['x-processingMode'],
        operation,
      });
    }
  }
  return operations;
}
