import { listOperations, loadSpec, type SpecOperation } from '../../scripts/spec.js';
import type { RecordedRequest } from './mock-fetch.js';

const spec = loadSpec();

interface Route {
  operation: SpecOperation;
  pattern: RegExp;
  params: number;
  query: Map<string, readonly string[] | undefined>;
}

/** Every spec operation as a matcher, with its declared query parameters (and allowed sort values). */
const routes: Route[] = listOperations(spec).map((operation) => {
  const pathParameters = spec.paths[operation.path] as { parameters?: { name: string; in: string; schema?: unknown }[] } | undefined;
  const declared = [...(pathParameters?.parameters ?? []), ...(operation.operation.parameters ?? [])].filter((p) => p.in === 'query');
  const query = new Map(
    declared.map((parameter) => {
      const schema = parameter.schema as { items?: { enum?: string[] } } | undefined;
      return [parameter.name, schema?.items?.enum] as const;
    }),
  );
  const source = operation.path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{[^}]+\\?\}/g, '[^/]+');
  return { operation, pattern: new RegExp(`^${source}$`), params: (operation.path.match(/\{/g) ?? []).length, query };
});

/**
 * Checks a request made by a tool against the spec: the endpoint must exist and
 * every query parameter (filters, sort values, includes) must be declared for it.
 * Returns a description of the problem, or undefined.
 */
export function checkRequest(request: RecordedRequest, basePath = '/api'): string | undefined {
  const path = request.url.pathname.startsWith(basePath) ? request.url.pathname.slice(basePath.length) : request.url.pathname;
  const candidates = routes
    .filter((route) => route.operation.method === request.method && route.pattern.test(path))
    .sort((a, b) => a.params - b.params);
  const route = candidates[0];
  if (!route) return `${request.method} ${path} is not an endpoint of the Forge API`;

  for (const [name, value] of request.url.searchParams) {
    if (!route.query.has(name)) return `${request.method} ${path}: query parameter ${name} is not declared for ${route.operation.id}`;
    const allowed = route.query.get(name);
    const invalid = allowed ? value.split(',').filter((item) => !allowed.includes(item)) : [];
    if (invalid.length > 0) return `${request.method} ${path}: ${name}=${invalid.join(',')} is not allowed by ${route.operation.id} (allowed: ${allowed!.join(', ')})`;
  }
  return undefined;
}
