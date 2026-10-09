import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;

export const organizationInput = z
  .string()
  .min(1)
  .optional()
  .describe('Organization slug. Optional when FORGE_ORGANIZATION is configured. Use forge_list_organizations to find it.');

export const paginationInput = {
  page_size: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(30)
    .describe('Number of results per page.'),
  cursor: z
    .string()
    .min(1)
    .optional()
    .describe('Pagination cursor: pass `next_cursor` from a previous response to get the next page.'),
};

export const responseFormatInput = z
  .enum(['concise', 'detailed'])
  .default('concise')
  .describe('"concise" returns the most useful fields; "detailed" returns every field Forge provides.');

export const paginationOutput = {
  next_cursor: z.string().nullable().describe('Cursor for the next page, or null on the last page.'),
  has_more: z.boolean().describe('Whether more results are available.'),
};

export function paginationSummary(nextCursor: string | null): string {
  return nextCursor ? ` More results are available: call again with cursor "${nextCursor}".` : '';
}

/** Projects an object onto the given keys, filling missing ones with null. */
export function pick<K extends string>(source: Record<string, unknown>, keys: readonly K[]): Record<K, unknown> {
  return Object.fromEntries(keys.map((key) => [key, source[key] ?? null])) as Record<K, unknown>;
}
