/**
 * Minimal, lossless editing of .env files: only the targeted keys change,
 * every other line (comments, blank lines, ordering) is kept as is.
 */

export const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;

/** Formats a value so dotenv parsers read it back unchanged. */
export function formatEnvValue(value: string): string {
  if (/^[A-Za-z0-9_.:/@,+\-=]*$/.test(value)) return value;
  // Single quotes are literal (no interpolation, no escapes) when the value allows it.
  if (!value.includes("'") && !value.includes('\n')) return `'${value}'`;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function keyOf(line: string): string | undefined {
  return /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=/.exec(line)?.[1];
}

export interface EnvChanges {
  set?: Record<string, string>;
  unset?: readonly string[];
}

export interface EnvPatch {
  content: string;
  updated: string[];
  added: string[];
  removed: string[];
}

export function patchEnv(content: string, { set = {}, unset = [] }: EnvChanges): EnvPatch {
  const lines = content.length > 0 ? content.replace(/\n$/, '').split('\n') : [];
  const updated: string[] = [];
  const removed: string[] = [];
  const pending = new Map(Object.entries(set));
  const toRemove = new Set(unset);

  const result: string[] = [];
  for (const line of lines) {
    const key = keyOf(line);
    if (key !== undefined && toRemove.has(key)) {
      if (!removed.includes(key)) removed.push(key);
      continue;
    }
    if (key !== undefined && Object.hasOwn(set, key)) {
      // Keep the first occurrence (updated in place) and drop duplicates.
      if (!pending.has(key)) continue;
      const exportPrefix = /^\s*export\s+/.test(line) ? 'export ' : '';
      result.push(`${exportPrefix}${key}=${formatEnvValue(pending.get(key)!)}`);
      pending.delete(key);
      updated.push(key);
      continue;
    }
    result.push(line);
  }

  const added = [...pending.keys()];
  for (const [key, value] of pending) result.push(`${key}=${formatEnvValue(value)}`);

  return { content: `${result.join('\n')}\n`, updated, added, removed };
}

/** Whether two .env contents are the same, ignoring trailing whitespace. */
export function sameEnv(a: string | null | undefined, b: string): boolean {
  return (a ?? '').trimEnd() === b.trimEnd();
}
