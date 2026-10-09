/**
 * Relationships in flattened resources are either resolved objects (when the
 * related resource was included) or bare `{ type, id }` identifiers.
 */
type Related = { id?: unknown } & Record<string, unknown>;

export function relatedId(resource: Record<string, unknown>, relationship: string): string | null {
  const related = resource[relationship] as Related | null | undefined;
  return related && typeof related === 'object' && related.id !== undefined ? String(related.id) : null;
}

export function relatedField(resource: Record<string, unknown>, relationship: string, field: string): unknown {
  const related = resource[relationship] as Related | null | undefined;
  return related && typeof related === 'object' ? (related[field] ?? null) : null;
}
