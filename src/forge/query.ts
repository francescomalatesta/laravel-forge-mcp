export type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];

/** Query parameters understood by the Forge API (JSON:API style). */
export interface ForgeQuery {
  page?: { size?: number | undefined; cursor?: string | undefined } | undefined;
  filter?: Record<string, QueryValue> | undefined;
  sort?: readonly string[] | undefined;
  include?: readonly string[] | undefined;
  [key: string]: QueryValue | Record<string, QueryValue> | undefined;
}

/**
 * Serializes a query using Forge conventions:
 * nested objects use brackets (`filter[name]=x`, `page[size]=30`),
 * arrays are comma-separated (`sort=name,-created_at`),
 * empty values are omitted.
 */
export function buildQuery(query: ForgeQuery | undefined): URLSearchParams {
  const params = new URLSearchParams();
  if (!query) return params;

  for (const [key, value] of Object.entries(query)) {
    if (isPlainObject(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        append(params, `${key}[${nestedKey}]`, nestedValue as QueryValue);
      }
    } else {
      append(params, key, value as QueryValue);
    }
  }
  return params;
}

function append(params: URLSearchParams, key: string, value: QueryValue): void {
  if (value === undefined || value === null || value === '') return;
  if (Array.isArray(value)) {
    if (value.length > 0) params.append(key, value.join(','));
    return;
  }
  params.append(key, String(value));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
