/**
 * Helpers to turn Forge's JSON:API documents into flat objects that are cheap
 * for a model to read: `{ id, ...attributes, ...resolvedRelationships }`.
 */

export interface ResourceIdentifier {
  id: string;
  type: string;
}

export interface Resource extends ResourceIdentifier {
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: ResourceIdentifier | ResourceIdentifier[] | null }>;
}

export interface PaginationMeta {
  next_cursor?: string | null;
  prev_cursor?: string | null;
  per_page?: number;
}

export interface CollectionDocument<R extends Resource = Resource> {
  data: R[];
  included?: Resource[];
  meta?: PaginationMeta;
}

export interface SingleDocument<R extends Resource = Resource> {
  data: R;
  included?: Resource[];
}

export type FlatResource = { id: string } & Record<string, unknown>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Flattens a resource. The JSON:API `id` (string) is canonical; a numeric
 * `attributes.id` duplicate is dropped. Relationships found in `included`
 * are inlined as flat objects, otherwise kept as identifiers.
 */
export function flattenResource(resource: Resource, included: readonly Resource[] = []): FlatResource {
  const { id: _duplicateId, ...attributes } = resource.attributes ?? {};
  const flat: FlatResource = { id: resource.id, ...attributes };

  for (const [name, relationship] of Object.entries(resource.relationships ?? {})) {
    const data = relationship?.data;
    if (data === undefined) continue;
    if (data === null) {
      flat[name] = null;
    } else if (Array.isArray(data)) {
      flat[name] = data.map((identifier) => resolve(identifier, included));
    } else {
      flat[name] = resolve(data, included);
    }
  }
  return flat;
}

export function flattenCollection(document: CollectionDocument): Page<FlatResource> {
  const included = document.included ?? [];
  return {
    items: document.data.map((resource) => flattenResource(resource, included)),
    nextCursor: document.meta?.next_cursor ?? null,
  };
}

export function flattenSingle(document: SingleDocument): FlatResource {
  return flattenResource(document.data, document.included ?? []);
}

function resolve(identifier: ResourceIdentifier, included: readonly Resource[]): FlatResource | ResourceIdentifier {
  const match = included.find((item) => item.type === identifier.type && item.id === identifier.id);
  return match ? flattenResource(match) : identifier;
}
