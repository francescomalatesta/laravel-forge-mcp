import { ForgeApiError, ForgeConnectionError } from './errors.js';
import { buildQuery, type ForgeQuery } from './query.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ForgeClientOptions {
  apiToken: string;
  baseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
  userAgent?: string;
  /** Upper bound for a single retry wait; longer waits fail fast instead. */
  maxRetryDelayMs?: number;
  /** Injectable for tests. */
  fetch?: typeof fetch;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export interface RequestOptions {
  query?: ForgeQuery | undefined;
  /** Sent as JSON, or as multipart/form-data when it is a FormData (file uploads). */
  body?: unknown;
  /** Accept header, for endpoints that return something other than JSON (e.g. "text/csv"). */
  accept?: string | undefined;
  signal?: AbortSignal | undefined;
}

export interface RateLimit {
  limit: number | undefined;
  remaining: number | undefined;
  reset: number | undefined;
}

export interface ForgeResponse<T> {
  status: number;
  data: T;
  rateLimit: RateLimit;
}

/** Methods that are safe to repeat after a transient server failure. */
const IDEMPOTENT_METHODS = new Set<HttpMethod>(['GET', 'PUT', 'DELETE']);
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

/**
 * Minimal HTTP client for the Forge API: authentication, timeouts,
 * JSON handling, error mapping and retries for rate limits / transient errors.
 */
export class ForgeClient {
  private readonly apiToken: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly maxRetryDelayMs: number;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: ForgeClientOptions) {
    this.apiToken = options.apiToken;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 30_000;
    this.userAgent = options.userAgent ?? 'laravel-forge-mcp';
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  get<T>(path: string, options: Omit<RequestOptions, 'body'> = {}): Promise<ForgeResponse<T>> {
    return this.request<T>('GET', path, options);
  }

  post<T>(path: string, options: RequestOptions = {}): Promise<ForgeResponse<T>> {
    return this.request<T>('POST', path, options);
  }

  put<T>(path: string, options: RequestOptions = {}): Promise<ForgeResponse<T>> {
    return this.request<T>('PUT', path, options);
  }

  patch<T>(path: string, options: RequestOptions = {}): Promise<ForgeResponse<T>> {
    return this.request<T>('PATCH', path, options);
  }

  delete<T>(path: string, options: RequestOptions = {}): Promise<ForgeResponse<T>> {
    return this.request<T>('DELETE', path, options);
  }

  async request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<ForgeResponse<T>> {
    const url = this.buildUrl(path, options.query);

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.send(method, url, options);
      } catch (error) {
        const failure = this.toConnectionError(error, method, path, options.signal);
        if (!failure.timedOut && IDEMPOTENT_METHODS.has(method) && attempt < this.maxRetries && !options.signal?.aborted) {
          await this.sleep(backoffMs(attempt));
          continue;
        }
        throw failure;
      }

      if (response.ok) {
        return {
          status: response.status,
          data: (await parseBody(response)) as T,
          rateLimit: readRateLimit(response.headers),
        };
      }

      const error = await toApiError(response, method, path);
      const delayMs = this.retryDelay(error, method, attempt);
      if (delayMs === undefined) throw error;
      await this.sleep(delayMs);
    }
  }

  private buildUrl(path: string, query: ForgeQuery | undefined): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const search = buildQuery(query).toString();
    return `${this.baseUrl}${normalizedPath}${search ? `?${search}` : ''}`;
  }

  private send(method: HttpMethod, url: string, options: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
      Accept: options.accept ?? 'application/json',
      'User-Agent': this.userAgent,
    };
    let body: string | FormData | undefined;
    if (options.body instanceof FormData) {
      // fetch sets the multipart Content-Type with its boundary.
      body = options.body;
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

    return this.fetchImpl(url, { method, headers, body, signal });
  }

  /** Returns how long to wait before retrying, or undefined to give up. */
  private retryDelay(error: ForgeApiError, method: HttpMethod, attempt: number): number | undefined {
    if (attempt >= this.maxRetries) return undefined;

    if (error.status === 429) {
      // A rate-limited request was rejected before processing: safe for any method.
      const delayMs = error.retryAfterSeconds !== undefined ? error.retryAfterSeconds * 1000 : backoffMs(attempt);
      return delayMs <= this.maxRetryDelayMs ? delayMs : undefined;
    }

    if (TRANSIENT_STATUSES.has(error.status) && IDEMPOTENT_METHODS.has(method)) {
      return backoffMs(attempt);
    }

    return undefined;
  }

  private toConnectionError(
    error: unknown,
    method: HttpMethod,
    path: string,
    signal: AbortSignal | undefined,
  ): ForgeConnectionError {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    const cancelled = signal?.aborted === true;
    const message = timedOut
      ? `Request to Forge timed out after ${this.timeoutMs} ms (${method} ${path}).`
      : cancelled
        ? `Request to Forge was cancelled (${method} ${path}).`
        : `Could not reach the Forge API (${method} ${path}): ${describeCause(error)}.`;
    return new ForgeConnectionError(message, method, path, timedOut, { cause: error });
  }
}

/** fetch() reports "fetch failed" and hides the useful part (DNS, TLS, refused...) in `cause`. */
function describeCause(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? error.cause.message : undefined;
  return (cause ? `${error.message} (${cause})` : error.message).replace(/\.+$/, '');
}

function backoffMs(attempt: number): number {
  return 500 * 2 ** attempt;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (text === '') return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('json')) {
    return JSON.parse(text);
  }
  return text;
}

async function toApiError(response: Response, method: HttpMethod, path: string): Promise<ForgeApiError> {
  let message = `${response.status} ${response.statusText}`.trim();
  let validationErrors: Record<string, string[]> | undefined;

  try {
    const body = await parseBody(response);
    if (body && typeof body === 'object') {
      const record = body as { message?: unknown; errors?: unknown };
      if (typeof record.message === 'string' && record.message) message = record.message;
      if (record.errors && typeof record.errors === 'object') {
        validationErrors = record.errors as Record<string, string[]>;
      }
    } else if (typeof body === 'string' && body.trim()) {
      message = body.trim().slice(0, 500);
    }
  } catch {
    // Keep the status-based message when the body is not parseable.
  }

  return new ForgeApiError(response.status, message, method, path, validationErrors, retryAfterSeconds(response.headers));
}

function retryAfterSeconds(headers: Headers): number | undefined {
  const retryAfter = toNumber(headers.get('retry-after'));
  if (retryAfter !== undefined) return Math.max(0, retryAfter);

  const reset = toNumber(headers.get('x-ratelimit-reset'));
  if (reset === undefined) return undefined;
  // Laravel sends a Unix timestamp; tolerate a relative number of seconds too.
  const seconds = reset > 1_000_000_000 ? reset - Math.floor(Date.now() / 1000) : reset;
  return Math.max(0, seconds);
}

function readRateLimit(headers: Headers): RateLimit {
  return {
    limit: toNumber(headers.get('x-ratelimit-limit')),
    remaining: toNumber(headers.get('x-ratelimit-remaining')),
    reset: toNumber(headers.get('x-ratelimit-reset')),
  };
}

function toNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
