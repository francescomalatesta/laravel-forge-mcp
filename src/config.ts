import { DEFAULT_TOOLSETS, TOOLSET_NAMES, isToolsetName, type ToolsetName } from './tools/toolsets.js';

export const DEFAULT_BASE_URL = 'https://forge.laravel.com/api';

export interface Config {
  /** Forge API token (Bearer). */
  apiToken: string;
  /** API base URL, without trailing slash. */
  baseUrl: string;
  /** Default organization slug used when a tool call omits `organization`. */
  organization: string | undefined;
  /** Toolsets whose tools are registered. */
  toolsets: ReadonlySet<ToolsetName>;
  /** Register read-only tools only. */
  readOnly: boolean;
  /** Register tools that return secrets (.env, credentials, keys). */
  allowSecrets: boolean;
  /** Per-request timeout in milliseconds. */
  timeoutMs: number;
  /** Retries for rate-limited or transient failures. */
  maxRetries: number;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

type Env = Record<string, string | undefined>;

export function loadConfig(env: Env = process.env): Config {
  const apiToken = env.FORGE_API_TOKEN?.trim();
  if (!apiToken) {
    throw new ConfigError(
      'FORGE_API_TOKEN is not set. Create a token in Forge (Account settings → API tokens) and pass it via the FORGE_API_TOKEN environment variable.',
    );
  }

  return {
    apiToken,
    baseUrl: parseBaseUrl(env.FORGE_API_URL),
    organization: env.FORGE_ORGANIZATION?.trim() || undefined,
    toolsets: parseToolsets(env.FORGE_TOOLSETS),
    readOnly: parseBoolean('FORGE_READ_ONLY', env.FORGE_READ_ONLY, false),
    allowSecrets: parseBoolean('FORGE_ALLOW_SECRETS', env.FORGE_ALLOW_SECRETS, false),
    timeoutMs: parseInteger('FORGE_TIMEOUT_MS', env.FORGE_TIMEOUT_MS, 30_000, 1_000),
    maxRetries: parseInteger('FORGE_MAX_RETRIES', env.FORGE_MAX_RETRIES, 2, 0),
  };
}

function parseBaseUrl(value: string | undefined): string {
  const raw = value?.trim() || DEFAULT_BASE_URL;
  try {
    new URL(raw);
  } catch {
    throw new ConfigError(`FORGE_API_URL is not a valid URL: "${raw}".`);
  }
  return raw.replace(/\/+$/, '');
}

/**
 * Accepts a comma-separated list of toolset names, "all", or "default".
 * "default" can be combined with other names, e.g. "default,databases".
 */
export function parseToolsets(value: string | undefined): ReadonlySet<ToolsetName> {
  const items = (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (items.length === 0) {
    return new Set(DEFAULT_TOOLSETS);
  }

  const result = new Set<ToolsetName>();
  for (const item of items) {
    if (item === 'all') {
      TOOLSET_NAMES.forEach((name) => result.add(name));
    } else if (item === 'default') {
      DEFAULT_TOOLSETS.forEach((name) => result.add(name));
    } else if (isToolsetName(item)) {
      result.add(item);
    } else {
      throw new ConfigError(
        `Unknown toolset "${item}" in FORGE_TOOLSETS. Valid values: all, default, ${TOOLSET_NAMES.join(', ')}.`,
      );
    }
  }
  return result;
}

function parseBoolean(name: string, value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new ConfigError(`${name} must be a boolean (true/false), got "${value}".`);
}

function parseInteger(name: string, value: string | undefined, fallback: number, min: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new ConfigError(`${name} must be an integer >= ${min}, got "${value}".`);
  }
  return parsed;
}
