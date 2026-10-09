/** Placeholder for secret values when FORGE_ALLOW_SECRETS is disabled. */
export const REDACTED = '[hidden: set FORGE_ALLOW_SECRETS=true to reveal]';

/** Replaces the given fields with a placeholder unless secrets are allowed. */
export function redact<T extends Record<string, unknown>>(value: T, fields: readonly string[], allowSecrets: boolean): T {
  if (allowSecrets) return value;
  const copy: Record<string, unknown> = { ...value };
  for (const field of fields) {
    if (copy[field] !== undefined && copy[field] !== null) copy[field] = REDACTED;
  }
  return copy as T;
}
